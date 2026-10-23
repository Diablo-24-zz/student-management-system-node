import multer from 'multer';

function mapDuplicateEntry(message) {
  const match = message.match(/for key '([^']+)'/i);
  const key = match ? match[1] : '';

  if (key.includes('email')) {
    return { message: 'A student with this email already exists.', fields: { email: 'Email already exists.' } };
  }

  if (key.includes('roll')) {
    return { message: 'A student with this roll number already exists.', fields: { roll_no: 'Roll number already exists.' } };
  }

  return { message: 'Duplicate record detected.', fields: {} };
}

export function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Unexpected server error.';
  let fields = err.fields || {};

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      message = 'Photo too large. Maximum size is 2MB.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      status = 415;
      message = 'Only JPEG, PNG, and WebP images are allowed.';
    } else {
      status = 400;
      message = 'File upload failed.';
    }
  }

  if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
    status = 409;
    const duplicateInfo = mapDuplicateEntry(message);
    message = duplicateInfo.message;
    fields = duplicateInfo.fields;
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 409;
    message = 'The related record cannot be deleted or changed because it is still in use.';
    fields = { course_id: 'The selected course is already in use.' };
  }

  if (status >= 500) {
    console.error('Unhandled error:', message);
    message = 'Unexpected server error.';
  }

  res.status(status).json({
    error: {
      message,
      fields
    }
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: 'Route not found.',
      fields: {}
    }
  });
}
