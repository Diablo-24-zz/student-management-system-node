const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  errorBox.textContent = '';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error?.message || 'Login failed.');
    }

    const redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
    window.location.href = redirect.startsWith('/') ? redirect : '/';
  } catch (error) {
    errorBox.textContent = error.message;
  }
});
