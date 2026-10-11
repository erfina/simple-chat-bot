const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');
const sendBtn = document.getElementById('send-btn');
const chips = document.getElementById('chips');

// riwayat percakapan yang dikirim ke backend (role: 'user' atau 'model')
const conversation = [];

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  appendMessage('user', userMessage);
  input.value = '';

  // simpan pesan user ke riwayat
  conversation.push({ role: 'user', text: userMessage });

  // pesan sementara yang nanti diganti dengan jawaban Gemini
  const botMessage = appendMessage('bot', 'Kak Angka lagi mikir...');
  botMessage.classList.add('thinking');
  setLoading(true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || `Server error: ${response.status}`);
    }

    if (data && data.result) {
      botMessage.textContent = data.result;
      // simpan jawaban ke riwayat dengan role 'model' (bukan 'bot')
      conversation.push({ role: 'model', text: data.result });
    } else {
      throw new Error('Tidak ada jawaban dari server.');
    }
  } catch (error) {
    console.error('Gagal mengambil jawaban:', error);
    botMessage.textContent = 'Maaf, jawabannya belum sampai. Coba kirim pertanyaanmu lagi ya.';
    botMessage.classList.add('error');
    // buang pesan user terakhir dari riwayat supaya urutan role tetap benar
    conversation.pop();
  } finally {
    botMessage.classList.remove('thinking');
    setLoading(false);
    input.focus();
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

// tombol saran: isi input lalu kirim otomatis
chips.addEventListener('click', function (e) {
  const chip = e.target.closest('.chip');
  if (!chip || sendBtn.disabled) return;
  input.value = chip.textContent;
  form.requestSubmit();
  chips.hidden = true;
});

function appendMessage(sender, text) {
  const msg = document.createElement('div');
  msg.classList.add('message', sender);
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msg;
}

function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  input.disabled = isLoading;
}
