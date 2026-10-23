import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import env from '../src/config/env.js';
import pool from '../src/config/db.js';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/app.js');

const adminUser = {
  username: process.env.API_TEST_ADMIN_USER || process.env.ADMIN_USERNAME,
  password: process.env.API_TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD
};
let adminCookies;

after(async () => {
  await pool.end();
});

async function login() {
  if (adminCookies) {
    return adminCookies;
  }

  if (!adminUser.username || !adminUser.password) {
    throw new Error('Set API_TEST_ADMIN_USER/API_TEST_ADMIN_PASSWORD or ADMIN_USERNAME/ADMIN_PASSWORD to run API integration tests.');
  }

  const res = await request(app)
    .post('/api/auth/login')
    .send(adminUser)
    .expect(200);

  adminCookies = res.headers['set-cookie'] || [];
  return adminCookies;
}

test('GET /api/stats returns 200 and summary data', async () => {
  const res = await request(app).get('/api/stats').expect(200);
  const courses = res.body.data.byCourse;
  const courseTotal = courses.reduce((sum, course) => sum + Number(course.student_count), 0);
  assert.equal(courses.length, 5);
  assert.equal(courseTotal, Number(res.body.data.totals.active_students));
  assert.equal(Number(res.body.data.totals.total_students), Number(res.body.data.totals.active_students));
  assert.ok(Array.isArray(res.body.data.byCourse));
});

test('GET /api/stats includes courses with no enrolled students', async () => {
  const courseName = `Empty Course ${Date.now()}`;
  let courseId;

  try {
    const [inserted] = await pool.query(
      'INSERT INTO courses (name, duration_months) VALUES (?, ?)',
      [courseName, 12]
    );
    courseId = inserted.insertId;

    const res = await request(app).get('/api/stats').expect(200);
    const emptyCourse = res.body.data.byCourse.find((course) => course.name === courseName);
    assert.ok(emptyCourse);
    assert.equal(Number(emptyCourse.student_count), 0);
    assert.equal(
      res.body.data.byCourse.reduce((sum, course) => sum + Number(course.student_count), 0),
      Number(res.body.data.totals.active_students)
    );
  } finally {
    if (courseId) await pool.query('DELETE FROM courses WHERE id = ?', [courseId]);
  }
});

test('health, courses, and auth endpoints work against the database', async () => {
  await request(app).get('/api/health').expect(200);
  await request(app).get('/api/courses').expect(200);

  const cookies = await login();
  const me = await request(app)
    .get('/api/auth/me')
    .set('Cookie', cookies)
    .expect(200);
  assert.equal(me.body.data.user.username, adminUser.username);

  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', cookies)
    .expect(200);
});

test('student create, read, update, delete, and restore routes work against the database', async () => {
  const cookies = await login();
  const unique = Date.now();
  const payload = {
    roll_no: `RT${unique}`.slice(0, 20),
    name: 'Route Test Student',
    email: `route${unique}@example.com`,
    phone: '9876543210',
    dob: '2004-01-01',
    gender: 'Male',
    course_id: 1
  };
  let studentId;

  try {
    const created = await request(app)
      .post('/api/students')
      .set('Cookie', cookies)
      .send(payload)
      .expect(201);
    studentId = created.body.data.id;

    await request(app).get(`/api/students/${studentId}`).expect(200);

    const updated = await request(app)
      .put(`/api/students/${studentId}`)
      .set('Cookie', cookies)
      .send({ ...payload, name: 'Updated Route Test Student' })
      .expect(200);
    assert.equal(updated.body.data.name, 'Updated Route Test Student');

    await request(app)
      .delete(`/api/students/${studentId}`)
      .set('Cookie', cookies)
      .expect(200);
    await request(app).get(`/api/students/${studentId}`).expect(404);

    const restored = await request(app)
      .post(`/api/students/${studentId}/restore`)
      .set('Cookie', cookies)
      .expect(200);
    assert.equal(restored.body.data.id, studentId);
  } finally {
    if (studentId) {
      await pool.query('DELETE FROM students WHERE id = ?', [studentId]);
    }
  }
});

test('GET /api/students with invalid sort falls back to created_at', async () => {
  const [res, expected] = await Promise.all([
    request(app).get('/api/students?sort=unknown&order=desc').expect(200),
    request(app).get('/api/students?sort=created_at&order=desc').expect(200)
  ]);

  assert.deepEqual(
    res.body.data.map((student) => student.id),
    expected.body.data.map((student) => student.id)
  );
  assert.equal(res.body.pagination.total, expected.body.pagination.total);
});

test('GET /api/students treats SQL-like search input as literal data', async () => {
  const search = encodeURIComponent("' OR 1=1 --");
  const res = await request(app)
    .get(`/api/students?search=${search}`)
    .expect(200);

  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.pagination.total, 0);
});

test('GET /api/students clamps limit to 50 and returns an empty list past the end', async () => {
  const clamped = await request(app)
    .get('/api/students?limit=9999&page=1')
    .expect(200);
  assert.equal(clamped.body.pagination.limit, 50);

  const pastEnd = await request(app)
    .get('/api/students?page=9999&limit=10')
    .expect(200);
  assert.deepEqual(pastEnd.body.data, []);
});

test('protected student routes reject tampered and expired JWTs with 401', async () => {
  const valid = jwt.sign({ id: 1, username: 'admin' }, env.JWT_SECRET, { expiresIn: '1h' });
  const [header, payload, signature] = valid.split('.');
  const tampered = `${header}.${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  const expired = jwt.sign({ id: 1, username: 'admin' }, env.JWT_SECRET, { expiresIn: -1 });

  await request(app)
    .get('/api/auth/me')
    .set('Cookie', `token=${tampered}`)
    .expect(401);
  await request(app)
    .get('/api/auth/me')
    .set('Cookie', `token=${expired}`)
    .expect(401);
});

test('POST /api/students rejects invalid data with 400', async () => {
  const cookies = await login();

  const res = await request(app)
    .post('/api/students')
    .set('Cookie', cookies)
    .send({
      roll_no: 'x',
      name: 'A',
      email: 'bad-email',
      phone: '123',
      dob: '2099-01-01',
      gender: 'Unknown',
      course_id: 'abc'
    })
    .expect(400);

  assert.match(res.body.error.message, /Validation failed/i);
  assert.ok(res.body.error.fields);
});

test('POST /api/students requires auth with 401', async () => {
  const res = await request(app)
    .post('/api/students')
    .send({
      roll_no: 'ZZ900',
      name: 'Test User',
      email: 'zz900@example.com',
      phone: '9876543210',
      dob: '2004-01-01',
      gender: 'Male',
      course_id: 1
    })
    .expect(401);

  assert.equal(res.body.error.message, 'Authentication required.');
});

test('GET /api/missing returns 404', async () => {
  const res = await request(app).get('/api/missing-route').expect(404);
  assert.equal(res.body.error.message, 'Route not found.');
});

test('POST /api/students prevents duplicate email/roll with 409', async () => {
  const cookies = await login();
  const duplicate = {
    roll_no: 'CS101',
    name: 'Duplicate Student',
    email: 'aarav.sharma@example.com',
    phone: '9876543210',
    dob: '2004-01-01',
    gender: 'Male',
    course_id: 1
  };

  const res = await request(app)
    .post('/api/students')
    .set('Cookie', cookies)
    .send(duplicate)
    .expect(409);

  assert.match(res.body.error.message, /already exists|already uses/i);
});

test('restore is blocked with 409 when another active student uses the same email', async () => {
  const cookies = await login();
  const stamp = Date.now();
  const original = {
    roll_no: `RD${stamp}`.slice(0, 20),
    name: 'Restore Conflict Student',
    email: `restore${stamp}@example.com`,
    phone: '9876543210',
    dob: '2004-01-01',
    gender: 'Male',
    course_id: 1
  };
  let deletedId;
  let activeId;

  try {
    const created = await request(app)
      .post('/api/students')
      .set('Cookie', cookies)
      .send(original)
      .expect(201);
    deletedId = created.body.data.id;

    await request(app)
      .delete(`/api/students/${deletedId}`)
      .set('Cookie', cookies)
      .expect(200);

    const duplicate = await request(app)
      .post('/api/students')
      .set('Cookie', cookies)
      .send({ ...original, roll_no: `RA${stamp}`.slice(0, 20), name: 'Active Restore Conflict' })
      .expect(201);
    activeId = duplicate.body.data.id;

    const restore = await request(app)
      .post(`/api/students/${deletedId}/restore`)
      .set('Cookie', cookies)
      .expect(409);
    assert.match(restore.body.error.message, /cannot be restored/i);
  } finally {
    for (const id of [deletedId, activeId]) {
      if (id) await pool.query('DELETE FROM students WHERE id = ?', [id]);
    }
  }
});

test('updating a student while keeping their own email returns 200', async () => {
  const cookies = await login();
  const stamp = Date.now();
  const payload = {
    roll_no: `UP${stamp}`.slice(0, 20),
    name: 'Update Own Email Student',
    email: `update${stamp}@example.com`,
    phone: '9876543210',
    dob: '2004-01-01',
    gender: 'Female',
    course_id: 1
  };
  let studentId;

  try {
    const created = await request(app)
      .post('/api/students')
      .set('Cookie', cookies)
      .send(payload)
      .expect(201);
    studentId = created.body.data.id;

    const updated = await request(app)
      .put(`/api/students/${studentId}`)
      .set('Cookie', cookies)
      .send({ ...payload, name: 'Updated Own Email Student' })
      .expect(200);
    assert.equal(updated.body.data.email, payload.email);
  } finally {
    if (studentId) await pool.query('DELETE FROM students WHERE id = ?', [studentId]);
  }
});

test('wrong password and unknown username return the same login message', async () => {
  const wrongPassword = await request(app)
    .post('/api/auth/login')
    .send({ username: adminUser.username, password: 'incorrect-password' })
    .expect(401);
  const unknownUser = await request(app)
    .post('/api/auth/login')
    .send({ username: `unknown-${Date.now()}`, password: 'incorrect-password' })
    .expect(401);

  assert.equal(wrongPassword.body.error.message, unknownUser.body.error.message);
});

test('POST /api/students/:id/photo accepts valid image and rejects invalid MIME type', async () => {
  const cookies = await login();
  const createRes = await request(app)
    .post('/api/students')
    .set('Cookie', cookies)
    .send({
      roll_no: `ZZ${Date.now()}`.slice(0, 20),
      name: 'Photo Test User',
      email: `photo${Date.now()}@example.com`,
      phone: '9876543211',
      dob: '2004-01-01',
      gender: 'Female',
      course_id: 1
    })
    .expect(201);

  const studentId = createRes.body.data.id;
  let uploadedFile;

  try {
    const valid = await request(app)
      .post(`/api/students/${studentId}/photo`)
      .set('Cookie', cookies)
      .attach('photo', Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7Z8AAAAASUVORK5CYII=',
        'base64'
      ), {
        filename: 'photo.png',
        contentType: 'image/png'
      })
      .expect(200);

    uploadedFile = valid.body.data.photo_path;
    assert.ok(uploadedFile);
    assert.match(uploadedFile, /\.png$/);

    const servedPhoto = await request(app)
      .get(`/uploads/${encodeURIComponent(uploadedFile)}`)
      .expect(200);
    assert.match(servedPhoto.headers['content-type'], /image\/png/);

    const badMime = await request(app)
      .post(`/api/students/${studentId}/photo`)
      .set('Cookie', cookies)
      .attach('photo', Buffer.from('hello'), {
        filename: 'bad.txt',
        contentType: 'text/plain'
      });

    assert.equal(badMime.status, 415);
    assert.match(badMime.body.error.message, /JPEG, PNG, and WebP/i);

    const badSignature = await request(app)
      .post(`/api/students/${studentId}/photo`)
      .set('Cookie', cookies)
      .attach('photo', Buffer.from('not an image'), {
        filename: 'fake.png',
        contentType: 'image/png'
      });

    assert.equal(badSignature.status, 415);
    assert.match(badSignature.body.error.message, /not a valid/i);

    const filesBeforeMissingStudent = new Set(await fs.readdir(path.join(process.cwd(), 'uploads')));
    const missingStudentUpload = await request(app)
      .post('/api/students/999999/photo')
      .set('Cookie', cookies)
      .attach('photo', Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7Z8AAAAASUVORK5CYII=',
        'base64'
      ), {
        filename: 'missing-student.png',
        contentType: 'image/png'
      });

    assert.equal(missingStudentUpload.status, 404);
    assert.deepEqual(
      (await fs.readdir(path.join(process.cwd(), 'uploads'))).sort(),
      [...filesBeforeMissingStudent].sort()
    );

    const tooBig = await request(app)
      .post(`/api/students/${studentId}/photo`)
      .set('Cookie', cookies)
      .attach('photo', Buffer.alloc(3 * 1024 * 1024, 'x'), {
        filename: 'too-big.jpg',
        contentType: 'image/jpeg'
      });

    assert.equal(tooBig.status, 413);
    assert.match(tooBig.body.error.message, /too large/i);
  } finally {
    await pool.query('DELETE FROM students WHERE id = ?', [studentId]);
    if (uploadedFile) {
      await fs.rm(path.join(process.cwd(), 'uploads', uploadedFile), { force: true });
    }
  }
});

test('GET /api/students/export.csv requires auth and returns CSV', async () => {
  await request(app).get('/api/students/export.csv').expect(401);

  const cookies = await login();
  const res = await request(app)
    .get('/api/students/export.csv')
    .set('Cookie', cookies)
    .expect(200);

  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /attachment; filename="students-/);
  assert.match(res.text, /"roll_no","name","email","phone","dob","gender","address","course_name"/);
});

test('CSV neutralizes cells beginning with =, +, -, and @', async () => {
  const cookies = await login();
  const stamp = Date.now();
  const prefixes = ['=', '+', '-', '@'];
  const studentIds = [];

  try {
    for (const [index, prefix] of prefixes.entries()) {
      const created = await request(app)
        .post('/api/students')
        .set('Cookie', cookies)
        .send({
          roll_no: `CSV${index}${stamp}`.slice(0, 20),
          name: `CSV formula ${index}`,
          email: `csv${index}${stamp}@example.com`,
          phone: '9876543210',
          dob: '2004-01-01',
          gender: 'Other',
          address: `${prefix}1+1`,
          course_id: 1
        })
        .expect(201);
      studentIds.push(created.body.data.id);
    }

    const exported = await request(app)
      .get('/api/students/export.csv')
      .set('Cookie', cookies)
      .expect(200);

    for (const prefix of prefixes) {
      assert.ok(exported.text.includes(`"'${prefix}1+1"`));
    }
  } finally {
    for (const id of studentIds) {
      await pool.query('DELETE FROM students WHERE id = ?', [id]);
    }
  }
});

test('POST /api/auth/login returns 429 after repeated attempts', async () => {
  let response;

  for (let attempt = 0; attempt < 15; attempt += 1) {
    response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });
    if (response.status === 429) {
      break;
    }
  }

  assert.equal(response.status, 429);
  assert.match(response.body.error.message, /Too many login attempts/i);
});

test('GET /api/_debug/error hides stack traces and returns generic 500', async () => {
  const res = await request(app).get('/api/_debug/error').expect(500);
  assert.equal(res.body.error.message, 'Unexpected server error.');
  assert.equal(res.body.error.fields && typeof res.body.error.fields, 'object', true);
  assert.equal(String(res.body.error.message).includes('Intentional'), false);
  assert.doesNotMatch(JSON.stringify(res.body), /stack|sql|intentional server error|select\s|insert\s|update\s|delete\s/i);
});
