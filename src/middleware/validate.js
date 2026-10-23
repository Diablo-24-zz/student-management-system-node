export function validateIdParam(id, label = 'id') {
  if (!/^[0-9]+$/.test(String(id))) {
    return { error: `${label} must be a positive integer.` };
  }
  return null;
}

export function validateStudentPayload(data = {}, { isUpdate = false, existing = null } = {}) {
  const fields = {};
  const cleaned = {
    roll_no: typeof data.roll_no === 'string' ? data.roll_no.trim() : data.roll_no,
    name: typeof data.name === 'string' ? data.name.trim() : data.name,
    email: typeof data.email === 'string' ? data.email.trim().toLowerCase() : data.email,
    phone: typeof data.phone === 'string' ? data.phone.trim() : data.phone,
    dob: typeof data.dob === 'string' ? data.dob.trim() : data.dob,
    gender: typeof data.gender === 'string' ? data.gender.trim() : data.gender,
    address: typeof data.address === 'string' ? data.address.trim() : data.address,
    course_id: data.course_id
  };

  if (!cleaned.roll_no || !/^[A-Za-z0-9]{3,20}$/.test(cleaned.roll_no)) {
    fields.roll_no = 'Roll number must be 3-20 alphanumeric characters.';
  }

  if (!cleaned.name || cleaned.name.length < 2 || cleaned.name.length > 100) {
    fields.name = 'Name must be between 2 and 100 characters.';
  }

  if (!cleaned.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) {
    fields.email = 'Email is invalid.';
  }

  if (!cleaned.phone || !/^[6-9]\d{9}$/.test(cleaned.phone)) {
    fields.phone = 'Phone must be a 10-digit Indian mobile number.';
  }

  if (!cleaned.dob) {
    fields.dob = 'Date of birth is required.';
  } else {
    const dob = new Date(cleaned.dob);
    const today = new Date();
    if (Number.isNaN(dob.getTime()) || dob > today) {
      fields.dob = 'Date of birth is invalid or is in the future.';
    }
  }

  const validGender = ['Male', 'Female', 'Other'];
  if (!validGender.includes(cleaned.gender)) {
    fields.gender = 'Gender is invalid.';
  }

  if (cleaned.address && cleaned.address.length > 255) {
    fields.address = 'Address cannot exceed 255 characters.';
  }

  if (cleaned.course_id === undefined || cleaned.course_id === null || cleaned.course_id === '') {
    fields.course_id = 'Course is required.';
  } else if (!Number.isInteger(Number(cleaned.course_id))) {
    fields.course_id = 'Course ID must be an integer.';
  }

  const hasErrors = Object.keys(fields).length > 0;
  return hasErrors ? { fields } : { values: cleaned };
}

export function validateCoursePayload(data = {}) {
  const fields = {};
  const name = typeof data.name === 'string' ? data.name.trim() : '';

  if (!name) {
    fields.name = 'Course name is required.';
  } else if (name.length < 2 || name.length > 100) {
    fields.name = 'Course name must be between 2 and 100 characters.';
  }

  return Object.keys(fields).length ? { fields } : { values: { name } };
}
