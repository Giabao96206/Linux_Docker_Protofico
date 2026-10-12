'use strict';

const bannerText = document.getElementById('bannerText');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageText');
const charCount = document.getElementById('charCount');
const formStatus = document.getElementById('formStatus');

function setBanner(message) {
  const safeMessage = String(message || 'Xin chào!');
  bannerText.replaceChildren();
  for (let i = 0; i < 2; i += 1) {
    const span = document.createElement('span');
    span.textContent = safeMessage;
    if (i === 1) span.setAttribute('aria-hidden', 'true');
    bannerText.appendChild(span);
  }
}

async function loadBanner() {
  try {
    const response = await fetch('/api/banner', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      setBanner(data.message);
    }
  } catch {
    // Keep the default banner if a refresh temporarily fails.
  }
}

messageInput.addEventListener('input', () => {
  charCount.textContent = `${messageInput.value.length} / 500`;
});

messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = messageForm.querySelector('button[type="submit"]');
  const payload = {
    name: document.getElementById('senderName').value.trim(),
    message: messageInput.value.trim()
  };
  if (!payload.message) return;
  button.disabled = true;
  button.style.opacity = '0.7';
  formStatus.className = 'form-status';
  formStatus.textContent = 'Đang gửi thông điệp…';
  try {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Gửi thông điệp chưa thành công.');
    formStatus.textContent = data.message || 'Đã gửi thành công!';
    messageForm.reset();
    charCount.textContent = '0 / 500';
  } catch (error) {
    formStatus.className = 'form-status error';
    formStatus.textContent = error.message || 'Có lỗi xảy ra. Hãy thử lại.';
  } finally {
    button.disabled = false;
    button.style.opacity = '1';
  }
});

loadBanner();
setInterval(loadBanner, 8000);
