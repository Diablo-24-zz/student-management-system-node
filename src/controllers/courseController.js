import pool from '../config/db.js';

export async function healthCheck(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({
      data: {
        status: 'ok',
        db: rows.length ? 'connected' : 'unreachable'
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listCourses(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, name, duration_months FROM courses ORDER BY name ASC');
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
}

export async function getStats(req, res, next) {
  try {
    const [totals] = await pool.query(
      `SELECT SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS total_students,
              SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS active_students
       FROM students`
    );

    const [courseCounts] = await pool.query(
      `SELECT c.id, c.name, COUNT(s.id) AS student_count
       FROM courses c
       LEFT JOIN students s ON s.course_id = c.id AND s.deleted_at IS NULL
       GROUP BY c.id, c.name
       ORDER BY c.name ASC`
    );

    const [recentStudents] = await pool.query(
      `SELECT s.id, s.name, s.roll_no, s.email, s.created_at, c.name AS course_name
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
       WHERE s.deleted_at IS NULL
       ORDER BY s.created_at DESC
       LIMIT 5`
    );

    res.json({
      data: {
        totals: totals[0],
        byCourse: courseCounts,
        recentStudents
      }
    });
  } catch (error) {
    next(error);
  }
}
