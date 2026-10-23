import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import { validateStudentPayload, validateIdParam } from '../src/middleware/validate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requireAuth } from '../src/middleware/auth.js';

const token = jwt.sign({ id: 1, username: 'admin' }, env.JWT_SECRET, { expiresIn: '2h' });

test('validateStudentPayload accepts valid data and lowercases email', () => {
  const result = validateStudentPayload({
    roll_no: 'CS101',
    name: 'Aarav Sharma',
    email: 'AARAV@EXAMPLE.COM',
    phone: '9876543210',
    dob: '2004-01-01',
    gender: 'Male',
    address: 'Some address',
    course_id: 1
  });

  assert.equal(result.values.email, 'aarav@example.com');
  assert.equal(result.values.roll_no, 'CS101');
});

test('validateStudentPayload collects fields for invalid input', () => {
  const result = validateStudentPayload({
    roll_no: 'x',
    name: 'A',
    email: 'bad',
    phone: '123',
    dob: '2099-01-01',
    gender: 'Unknown',
    course_id: 'abc'
  });

  assert.ok(result.fields);
  assert.match(result.fields.roll_no, /Roll number/);
  assert.match(result.fields.email, /Email/);
  assert.match(result.fields.dob, /future/);
  assert.match(result.fields.course_id, /Course/);
});

test('validateIdParam rejects non-numeric ids', () => {
  assert.ok(validateIdParam('abc'));
  assert.equal(validateIdParam('10'), null);
});

test('errorHandler maps MySQL duplicate key errors to 409', () => {
  const req = {};
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  errorHandler({ code: 'ER_DUP_ENTRY', message: "Duplicate entry 'AARAV@EXAMPLE.COM' for key 'uq_students_email_active'" }, req, res, () => {});

  assert.equal(res.code, 409);
  assert.equal(res.payload.error.fields.email, 'Email already exists.');
});

test('requireAuth blocks missing token and accepts valid token', () => {
  const missing = {
    cookies: {}
  };
  let statusCode = 0;
  let body = null;
  const resMissing = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; }
  };

  requireAuth(missing, resMissing, () => {});
  assert.equal(statusCode, 401);

  const valid = {
    cookies: { token }
  };
  let nextCalled = false;
  const resValid = {
    status() { return this; },
    json() { return this; }
  };

  requireAuth(valid, resValid, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
