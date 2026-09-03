/* Envio do formulário de login. */
(function () {
  'use strict';

  const form = document.getElementById('login-form');
    const error = document.getElementById('error');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      error.classList.add('hidden');

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
        window.location.href = '/admin';
      } catch (err) {
        error.textContent = err.message;
        error.classList.remove('hidden');
        button.disabled = false;
      }
    });
})();
