const state = {
  page: 1,
  limit: 10,
  totalPages: 1,
  query: '',
  courseId: '',
  sort: 'created_at',
  order: 'desc',
  isAdmin: false,
  user: null
};

const statsEl = document.getElementById('stats');
const tableBody = document.getElementById('studentTableBody');
const searchInput = document.getElementById('searchInput');
const courseFilter = document.getElementById('courseFilter');
const sortField = document.getElementById('sortField');
const sortOrder = document.getElementById('sortOrder');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageLabel = document.getElementById('pageLabel');
const loginLink = document.getElementById('loginLink');
const logoutBtn = document.getElementById('logoutBtn');
const addStudentBtn = document.getElementById('addStudentBtn');
const exportBtn = document.getElementById('exportBtn');
const toast = document.getElementById('toast');
const studentDialog = document.getElementById('studentDialog');
const studentForm = document.getElementById('studentForm');
const studentDialogTitle = document.getElementById('studentDialogTitle');
const studentIdInput = document.getElementById('studentId');
const studentCourse = document.getElementById('studentCourse');
const studentPhoto = document.getElementById('studentPhoto');
let photoPreview = document.getElementById('photoPreview');
let photoPreviewUrl = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add('hidden'), 2200);
}

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || '?';
}

function createPhotoPlaceholder(name, className = 'photo-placeholder') {
  const placeholder = document.createElement('div');
  placeholder.className = className;
  placeholder.textContent = getInitials(name);
  placeholder.setAttribute('aria-label', `${name || 'Student'} initials`);
  return placeholder;
}

function releasePhotoPreviewUrl() {
  if (photoPreviewUrl) {
    URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = null;
  }
}

function setPhotoPreview(name, path = '') {
  releasePhotoPreviewUrl();
  const file = studentPhoto.files?.[0];
  if (!file && !path) {
    photoPreview.replaceWith(createPhotoPlaceholder(name, 'photo-placeholder preview-placeholder'));
    photoPreview = document.querySelector('#studentDialog .preview-placeholder');
    return;
  }

  const image = document.createElement('img');
  image.className = 'photo-preview';
  image.alt = `${name || 'Student'} photo preview`;
  image.addEventListener('error', () => {
    image.replaceWith(createPhotoPlaceholder(name, 'photo-placeholder preview-placeholder'));
    photoPreview = document.querySelector('#studentDialog .preview-placeholder');
  }, { once: true });
  if (file) {
    photoPreviewUrl = URL.createObjectURL(file);
    image.src = photoPreviewUrl;
  } else {
    image.src = `/uploads/${encodeURIComponent(path)}`;
  }
  photoPreview.replaceWith(image);
  photoPreview = image;
}

function setAdminUI() {
  const showAdmin = state.isAdmin;
  addStudentBtn.classList.toggle('hidden', !showAdmin);
  exportBtn.classList.toggle('hidden', !showAdmin);
  logoutBtn.classList.toggle('hidden', !showAdmin);
  loginLink.classList.toggle('hidden', showAdmin);
  if (state.user) {
    document.getElementById('userBadge').textContent = `Logged in as ${state.user.username}`;
  } else {
    document.getElementById('userBadge').textContent = 'Not signed in';
  }
}

async function fetchJson(url, options = {}, { redirectOn401 = true } = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && redirectOn401) {
      state.isAdmin = false;
      state.user = null;
      setAdminUI();
      window.location.href = '/login.html';
    }
    const error = new Error(data?.error?.message || 'Request failed');
    error.status = response.status;
    throw error;
  }

  return data;
}

async function loadCourses() {
  const result = await fetchJson('/api/courses');
  const courses = result.data || [];
  courseFilter.replaceChildren();
  const allCourses = document.createElement('option');
  allCourses.value = '';
  allCourses.textContent = 'All courses';
  courseFilter.appendChild(allCourses);
  studentCourse.replaceChildren();
  const chooseCourse = document.createElement('option');
  chooseCourse.value = '';
  chooseCourse.textContent = 'Select course';
  studentCourse.appendChild(chooseCourse);
  for (const course of courses) {
    const option = document.createElement('option');
    option.value = course.id;
    option.textContent = course.name;
    if (String(course.id) === String(state.courseId)) {
      option.selected = true;
    }
    courseFilter.appendChild(option);
    const formOption = document.createElement('option');
    formOption.value = course.id;
    formOption.textContent = course.name;
    studentCourse.appendChild(formOption);
  }
}

async function loadStats() {
  const result = await fetchJson('/api/stats');
  const data = result.data || {};
  const totals = data.totals || {};
  const byCourse = data.byCourse || [];

  statsEl.replaceChildren();
  const cards = [
    { label: 'Total Students', value: totals.total_students || 0 },
    { label: 'Active Students', value: totals.active_students || 0 }
  ];

  for (const course of byCourse) {
    cards.push({ label: course.name, value: course.student_count || 0 });
  }

  for (const card of cards) {
    const item = document.createElement('div');
    item.className = 'stat-card';
    const label = document.createElement('div');
    label.textContent = card.label;
    const value = document.createElement('h2');
    value.textContent = String(card.value);
    item.appendChild(label);
    item.appendChild(value);
    statsEl.appendChild(item);
  }
}

async function loadStudents() {
  const params = new URLSearchParams({
    search: state.query,
    course: state.courseId,
    sort: state.sort,
    order: state.order,
    page: state.page,
    limit: state.limit
  });

  const result = await fetchJson(`/api/students?${params.toString()}`);
  const rows = result.data || [];
  const pagination = result.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };
  state.totalPages = pagination.totalPages || 1;

  tableBody.replaceChildren();
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = 'No students found.';
    row.appendChild(cell);
    tableBody.appendChild(row);
  } else {
    for (const student of rows) {
      const row = document.createElement('tr');
      const photo = document.createElement('td');
      if (student.photo_path) {
        const img = document.createElement('img');
        img.className = 'photo-thumb';
        img.alt = `${student.name} photo`;
        img.addEventListener('error', () => {
          img.replaceWith(createPhotoPlaceholder(student.name));
        }, { once: true });
        img.src = `/uploads/${encodeURIComponent(student.photo_path)}`;
        photo.appendChild(img);
      } else {
        photo.appendChild(createPhotoPlaceholder(student.name));
      }

      const roll = document.createElement('td');
      roll.textContent = student.roll_no;

      const name = document.createElement('td');
      name.textContent = student.name;

      const email = document.createElement('td');
      email.textContent = student.email;

      const course = document.createElement('td');
      course.textContent = student.course_name || '—';

      const created = document.createElement('td');
      created.textContent = new Date(student.created_at).toLocaleDateString();

      const actions = document.createElement('td');
      if (state.isAdmin) {
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => openStudentDialog(student));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteStudent(student));
        actions.append(editBtn, deleteBtn);
      } else {
        actions.textContent = '—';
      }

      row.append(photo, roll, name, email, course, created, actions);
      tableBody.appendChild(row);
    }

  }

  pageLabel.textContent = `Page ${pagination.page} of ${state.totalPages}`;
  prevPageBtn.disabled = pagination.page <= 1;
  nextPageBtn.disabled = pagination.page >= state.totalPages;
}

function openStudentDialog(student = null) {
  if (!state.isAdmin) {
    return;
  }

  studentForm.reset();
  studentIdInput.value = student?.id || '';
  studentDialogTitle.textContent = student ? 'Edit Student' : 'Add Student';
  if (student) {
    studentForm.elements.roll_no.value = student.roll_no || '';
    studentForm.elements.name.value = student.name || '';
    studentForm.elements.email.value = student.email || '';
    studentForm.elements.phone.value = student.phone || '';
    studentForm.elements.dob.value = String(student.dob || '').slice(0, 10);
    studentForm.elements.gender.value = student.gender || '';
    studentForm.elements.course_id.value = student.course_id || '';
    studentForm.elements.address.value = student.address || '';
  }
  setPhotoPreview(student?.name || '');
  if (student?.photo_path) {
    setPhotoPreview(student.name, student.photo_path);
  }
  studentDialog.showModal();
}

async function deleteStudent(student) {
  if (!state.isAdmin || !window.confirm(`Delete ${student.name}?`)) {
    return;
  }

  try {
    await fetchJson(`/api/students/${student.id}`, { method: 'DELETE' });
    await Promise.all([loadStudents(), loadStats()]);
    showToast('Student deleted.');
  } catch (error) {
    showToast(error.status ? `${error.status}: ${error.message}` : error.message);
  }
}

async function checkAuth() {
  try {
    const result = await fetchJson('/api/auth/me', {}, { redirectOn401: false });
    state.user = result.data?.user || null;
    state.isAdmin = Boolean(state.user);
  } catch {
    state.user = null;
    state.isAdmin = false;
  }
  setAdminUI();
  if (state.isAdmin) {
    await loadStudents();
  }
}

async function refreshAll() {
  await Promise.all([loadCourses(), loadStats(), loadStudents()]);
}

searchInput.addEventListener('input', (event) => {
  state.query = event.target.value.trim();
  state.page = 1;
  loadStudents();
});

courseFilter.addEventListener('change', (event) => {
  state.courseId = event.target.value;
  state.page = 1;
  loadStudents();
});

sortField.addEventListener('change', (event) => {
  state.sort = event.target.value;
  loadStudents();
});

sortOrder.addEventListener('change', (event) => {
  state.order = event.target.value;
  loadStudents();
});

prevPageBtn.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    loadStudents();
  }
});

nextPageBtn.addEventListener('click', () => {
  if (state.page < state.totalPages) {
    state.page += 1;
    loadStudents();
  }
});

loginLink.addEventListener('click', () => {
  window.location.href = '/login.html';
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetchJson('/api/auth/logout', { method: 'POST' });
    state.isAdmin = false;
    state.user = null;
    setAdminUI();
    showToast('Logged out.');
    window.location.href = '/login.html';
  } catch (error) {
    showToast(error.message);
  }
});

exportBtn.addEventListener('click', async () => {
  if (!state.isAdmin) {
    return;
  }

  try {
    const response = await fetch('/api/students/export.csv', {
      credentials: 'same-origin'
    });
    if (!response.ok) {
      if (response.status === 401) {
        state.isAdmin = false;
        state.user = null;
        setAdminUI();
        window.location.href = '/login.html';
      }
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error?.message || 'CSV export failed.');
    }

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'students.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showToast(error.message);
  }
});

addStudentBtn.addEventListener('click', () => openStudentDialog());
document.getElementById('closeStudentDialog').addEventListener('click', () => studentDialog.close());
document.getElementById('cancelStudentDialog').addEventListener('click', () => studentDialog.close());
studentDialog.addEventListener('close', releasePhotoPreviewUrl);
studentForm.elements.name.addEventListener('input', () => {
  if (!studentPhoto.files?.[0]) {
    setPhotoPreview(studentForm.elements.name.value);
  }
});
studentPhoto.addEventListener('change', () => {
  setPhotoPreview(studentForm.elements.name.value, '');
});

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.isAdmin) {
    return;
  }

  const formData = new FormData(studentForm);
  const studentId = studentIdInput.value;
  const payload = Object.fromEntries(formData.entries());
  delete payload.id;
  delete payload.photo;
  payload.course_id = Number(payload.course_id);

  try {
    const saved = await fetchJson(
      studentId ? `/api/students/${studentId}` : '/api/students',
      {
        method: studentId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    const savedStudent = saved.data;
    studentIdInput.value = savedStudent.id;
    const photoFile = studentPhoto.files?.[0];
    if (photoFile) {
      const photoForm = new FormData();
      photoForm.append('photo', photoFile);
      await fetchJson(`/api/students/${savedStudent.id}/photo`, {
        method: 'POST',
        body: photoForm
      });
    }

    studentDialog.close();
    await Promise.all([loadStudents(), loadStats()]);
    showToast('Student saved.');
  } catch (error) {
    showToast(error.status ? `${error.status}: ${error.message}` : error.message);
  }
});

checkAuth();
refreshAll();
