// Shared auth utilities and sidebar helpers

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/';
      return null;
    }
    return await res.json();
  } catch {
    window.location.href = '/';
    return null;
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function showToast(msg, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function setSidebarUser(user) {
  if (!user) return;
  const avatar = document.getElementById('sidebarAvatar');
  const name = document.getElementById('sidebarUsername');
  if (avatar) avatar.textContent = user.username.charAt(0).toUpperCase();
  if (name) name.textContent = user.username;
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.querySelector('.mobile-menu-btn');
  if (sidebar && sidebar.classList.contains('open')) {
    if (!sidebar.contains(e.target) && menuBtn && !menuBtn.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  }
});
