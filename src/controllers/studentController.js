import fs from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import pool from '../config/db.js';
import { validateStudentPayload, validateIdParam } from '../middleware/validate.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const SORT_MAP = {
  name: 's.name',
  email: 's.email',
  roll_no: 's.roll_no',
  created_at: 's.created_at',
  course_name: 'course_name'
};

function escapeLikeValue(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function hasValidImageSignature(content, mimetype) {
  if (mimetype === 'image/jpeg') {
    return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }

  if (mimetype === 'image/png') {
    return content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  return mimetype === 'image/webp'
    && content.length >= 12
    && content.toString('ascii', 0, 4) === 'RIFF'
    && content.toString('ascii', 8, 12) === 'WEBP';
}

function parsePagination(page, limit) {
  const numericPage = Number(page) || DEFAULT_PAGE;
  const numericLimit = Number(limit) || DEFAULT_LIMIT;
  const safePage = Math.max(1, numericPage);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, numericLimit));
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit
  };
}

function resolveSort(sort, order) {
  const normalizedSort = SORT_MAP[sort] ? sort : 'created_at';
  const normalizedOrder = order === 'asc' ? 'ASC' : 'DESC';
  return {
    sort: normalizedSort,
    order: normalizedOrder,
    column: SORT_MAP[normalizedSort]
  };
}

async function ensureCourseExists(courseId) {
  const [[course]] = await pool.query('SELECT id FROM courses WHERE id = ?', [courseId]);
  return Boolean(course);
}

async function ensureUniqueEmailRoll({ email, rollNo, currentId = null }) {
  const [rows] = await pool.query(
    `SELECT id, email, roll_no FROM students WHERE (email = ? OR roll_no = ?) AND deleted_at IS NULL AND id != ?`,
    [email, rollNo, currentId ?? 0]
  );

  if (!rows.length) {
    return;
  }

  if (rows.some((row) => row.email.toLowerCase() === email.toLowerCase())) {
    const error = new Error('Another student already uses this email address.');
    error.statusCode = 409;
    error.fields = { email: 'Email already exists.' };
    throw error;
  }

  const error = new Error('Another student already uses this roll number.');
  error.statusCode = 409;
  error.fields = { roll_no: 'Roll number already exists.' };
  throw error;
}

async function getStudentByIdOrThrow(id) {
  const [rows] = await pool.query(
    `SELECT s.*, c.name AS course_name
     FROM students s
     LEFT JOIN courses c ON c.id = s.course_id
     WHERE s.id = ? AND s.deleted_at IS NULL`,
    [id]
  );

  if (!rows.length) {
    const error = new Error('Student not found.');
    error.statusCode = 404;
    throw error;
  }

  return rows[0];
}

export async function listStudents(req, res, next) {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const courseId = req.query.course;
    const sortConfig = resolveSort(req.query.sort, req.query.order);
    const pagination = parsePagination(req.query.page, req.query.limit);

    const whereClauses = ['s.deleted_at IS NULL'];
    const params = [];

    if (search) {
      const likeValue = `%${escapeLikeValue(search)}%`;
      whereClauses.push('(s.name LIKE ? OR s.email LIKE ? OR s.roll_no LIKE ?)');
      params.push(likeValue, likeValue, likeValue);
    }

    if (courseId && /^[0-9]+$/.test(String(courseId))) {
      whereClauses.push('s.course_id = ?');
      params.push(Number(courseId));
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT s.id, s.roll_no, s.name, s.email, s.phone, s.dob, s.gender, s.address, s.course_id,
              c.name AS course_name, s.photo_path, s.created_at, s.updated_at
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
       ${whereSql}
       ORDER BY ${sortConfig.column} ${sortConfig.order}
       LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM students s
       ${whereSql}`,
      params
    );

    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    res.json({
      data: rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudent(req, res, next) {
  try {
    const id = req.params.id;
    const validation = validateIdParam(id);
    if (validation) {
      const error = new Error(validation.error);
      error.statusCode = 400;
      throw error;
    }

    const student = await getStudentByIdOrThrow(id);
    res.json({ data: student });
  } catch (error) {
    next(error);
  }
}

export async function createStudent(req, res, next) {
  try {
    const validation = validateStudentPayload(req.body || {});
    if (validation.fields) {
      const error = new Error('Validation failed.');
      error.statusCode = 400;
      error.fields = validation.fields;
      throw error;
    }

    const exists = await ensureCourseExists(validation.values.course_id);
    if (!exists) {
      const error = new Error('Selected course does not exist.');
      error.statusCode = 409;
      error.fields = { course_id: 'Course does not exist.' };
      throw error;
    }

    await ensureUniqueEmailRoll({
      email: validation.values.email,
      rollNo: validation.values.roll_no
    });

    const [result] = await pool.query(
      `INSERT INTO students (roll_no, name, email, phone, dob, gender, address, course_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        validation.values.roll_no,
        validation.values.name,
        validation.values.email,
        validation.values.phone,
        validation.values.dob,
        validation.values.gender,
        validation.values.address || null,
        validation.values.course_id
      ]
    );

    const [rows] = await pool.query(
      `SELECT s.*, c.name AS course_name
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
       WHERE s.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ data: rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function updateStudent(req, res, next) {
  try {
    const id = req.params.id;
    const validation = validateIdParam(id);
    if (validation) {
      const error = new Error(validation.error);
      error.statusCode = 400;
      throw error;
    }

    const existing = await getStudentByIdOrThrow(id);
    const payloadValidation = validateStudentPayload(req.body || {}, { isUpdate: true, existing });
    if (payloadValidation.fields) {
      const error = new Error('Validation failed.');
      error.statusCode = 400;
      error.fields = payloadValidation.fields;
      throw error;
    }

    const values = payloadValidation.values;

    const courseExists = await ensureCourseExists(values.course_id);
    if (!courseExists) {
      const error = new Error('Selected course does not exist.');
      error.statusCode = 409;
      error.fields = { course_id: 'Course does not exist.' };
      throw error;
    }

    await ensureUniqueEmailRoll({
      email: values.email,
      rollNo: values.roll_no,
      currentId: Number(id)
    });

    await pool.query(
      `UPDATE students
       SET roll_no = ?, name = ?, email = ?, phone = ?, dob = ?, gender = ?, address = ?, course_id = ?
       WHERE id = ?`,
      [
        values.roll_no,
        values.name,
        values.email,
        values.phone,
        values.dob,
        values.gender,
        values.address || null,
        values.course_id,
        Number(id)
      ]
    );

    const student = await getStudentByIdOrThrow(id);
    res.json({ data: student });
  } catch (error) {
    next(error);
  }
}

export async function deleteStudent(req, res, next) {
  try {
    const id = req.params.id;
    const validation = validateIdParam(id);
    if (validation) {
      const error = new Error(validation.error);
      error.statusCode = 400;
      throw error;
    }

    const existing = await getStudentByIdOrThrow(id);

    const [result] = await pool.query(
      'UPDATE students SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (result.affectedRows === 0) {
      const error = new Error('Student not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({ data: { id: existing.id, deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function restoreStudent(req, res, next) {
  try {
    const id = req.params.id;
    const validation = validateIdParam(id);
    if (validation) {
      const error = new Error(validation.error);
      error.statusCode = 400;
      throw error;
    }

    const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id]);
    if (!rows.length) {
      const error = new Error('Student not found.');
      error.statusCode = 404;
      throw error;
    }

    const student = rows[0];
    const [conflicts] = await pool.query(
      `SELECT id FROM students WHERE (email = ? OR roll_no = ?) AND deleted_at IS NULL AND id != ?`,
      [student.email, student.roll_no, id]
    );

    if (conflicts.length) {
      const error = new Error('This student cannot be restored because the email or roll number is already used by an active student.');
      error.statusCode = 409;
      error.fields = {
        email: 'Email or roll number is in use by another active student.'
      };
      throw error;
    }

    await pool.query('UPDATE students SET deleted_at = NULL WHERE id = ?', [id]);
    const studentRecord = await getStudentByIdOrThrow(id);
    res.json({ data: studentRecord });
  } catch (error) {
    next(error);
  }
}

export async function uploadStudentPhoto(req, res, next) {
  let photoSaved = false;

  try {
    const id = req.params.id;
    const validation = validateIdParam(id);
    if (validation) {
      const error = new Error(validation.error);
      error.statusCode = 400;
      throw error;
    }

    if (!req.file) {
      const error = new Error('A photo file is required.');
      error.statusCode = 400;
      throw error;
    }

    const fileContent = await fs.readFile(req.file.path);
    if (!hasValidImageSignature(fileContent, req.file.mimetype)) {
      await fs.rm(req.file.path, { force: true });
      const error = new Error('The uploaded file is not a valid JPEG, PNG, or WebP image.');
      error.statusCode = 415;
      throw error;
    }

    const student = await getStudentByIdOrThrow(id);
    const newPath = req.file.filename;
    const previousPath = student.photo_path;

    await pool.query('UPDATE students SET photo_path = ? WHERE id = ?', [newPath, id]);
    photoSaved = true;

    if (previousPath) {
      const storedPath = path.join(process.cwd(), 'uploads', previousPath);
      await fs.rm(storedPath, { force: true });
    }

    const updated = await getStudentByIdOrThrow(id);
    res.status(200).json({ data: updated });
  } catch (error) {
    if (req.file?.path && !photoSaved) {
      try {
        await fs.rm(req.file.path, { force: true });
      } catch (cleanupError) {
        return next(cleanupError);
      }
    }
    next(error);
  }
}

export async function exportStudentsCsv(req, res, next) {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const courseId = req.query.course;
    const whereClauses = ['s.deleted_at IS NULL'];
    const params = [];

    if (search) {
      const likeValue = `%${escapeLikeValue(search)}%`;
      whereClauses.push('(s.name LIKE ? OR s.email LIKE ? OR s.roll_no LIKE ?)');
      params.push(likeValue, likeValue, likeValue);
    }

    if (courseId && /^[0-9]+$/.test(String(courseId))) {
      whereClauses.push('s.course_id = ?');
      params.push(Number(courseId));
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT s.roll_no, s.name, s.email, s.phone, s.dob, s.gender, s.address, c.name AS course_name
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
       ${whereSql}
       ORDER BY s.created_at DESC`,
      params
    );

    const csvRows = [
      ['roll_no', 'name', 'email', 'phone', 'dob', 'gender', 'address', 'course_name']
    ];

    for (const row of rows) {
      csvRows.push([
        row.roll_no || '',
        row.name || '',
        row.email || '',
        row.phone || '',
        row.dob || '',
        row.gender || '',
        (row.address || '').replace(/\r?\n/g, ' '),
        row.course_name || ''
      ]);
    }

    const escapeCell = (value) => {
      const stringValue = String(value ?? '');
      const safe = stringValue.replace(/\r\n/g, ' ').replace(/\n/g, ' ');
      const normalized = safe.startsWith('=') || safe.startsWith('+') || safe.startsWith('-') || safe.startsWith('@')
        ? `'${safe}`
        : safe;
      return `"${normalized.replace(/"/g, '""')}"`;
    };

    const csv = '\uFEFF' + csvRows.map((row) => row.map(escapeCell).join(',')).join('\n');
    const filename = `students-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
}
