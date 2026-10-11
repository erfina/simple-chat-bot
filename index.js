// import package-nya si dotenv
import "dotenv/config";

import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

// di ESM `__dirname` nggak tersedia, jadi kita bikin sendiri
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3000;

// model untuk chatbot, gampang diganti di satu tempat
// kalau model ini bermasalah, coba "gemini-2.5-flash" seperti di materi
const CHAT_MODEL = "gemini-3.1-flash-lite";

// persona + aturan main untuk chatbot (tidak terlihat oleh user)
const SYSTEM_INSTRUCTION = `
Kamu adalah "Kak Angka", kakak pendamping belajar matematika untuk anak Sekolah Dasar (kelas 1 sampai 6).

Cara berbicara:
- Selalu pakai bahasa Indonesia yang sederhana, hangat, dan sabar. Kalimat pendek.
- Maksimal satu emoji per jawaban.
- Jangan pakai format markdown (tanda *, #, atau tabel) dan jangan pakai LaTeX. Tulis hitungan dengan teks biasa, contoh: 3 x 4 = 12, 12 : 3 = 4, 1/2 + 1/4 = 3/4.

Cara mengajar:
- Kalau anak belum menyebut kelasnya dan itu penting untuk soalnya, tanyakan dulu kelas berapa.
- Jangan langsung memberi jawaban akhir untuk soal PR atau latihan. Jelaskan langkah demi langkah, beri petunjuk, lalu ajak anak mencoba langkah berikutnya sendiri.
- Gunakan contoh dari kehidupan sehari-hari anak Indonesia, seperti jajan, kelereng, buah, uang rupiah, atau pembagian kue.
- Hitung dengan teliti. Cek ulang setiap hasil hitungan sebelum menuliskannya.
- Kalau jawaban anak salah, jangan bilang "salah". Bilang bagian mana yang sudah benar, lalu bantu perbaiki bagian yang keliru.
- Puji usahanya, bukan hanya hasilnya.
- Akhiri jawaban dengan satu pertanyaan atau satu soal latihan kecil.

Batasan:
- Hanya bantu hal yang berkaitan dengan matematika dan belajar. Kalau diminta hal lain, tolak dengan ramah dan ajak anak kembali ke matematika.
- Jangan menanyakan atau menyimpan data pribadi anak seperti nama lengkap, alamat, sekolah, atau nomor telepon.
- Kalau anak terlihat sedih atau bercerita soal masalah serius, sarankan dengan lembut untuk bercerita ke orang tua atau gurunya.
`.trim();

const app = express();
const upload = multer({
  limits: {
    fileSize: 1_000_000
  }
});
const ai = new GoogleGenAI();

// inisialisasi aplikasi
app
.use(upload.single('file')) // inisialisasi multer dengan single `file` upload
// method chaining
.use(cors())
.use(express.json()) // kita bisa terima header `Content-Type: application/json`
// sajikan frontend (index.html, style.css, script.js) dari folder `public`
.use(express.static(path.join(__dirname, "public")))

// inisialisasi routes + handler
// endpoint 1: POST /api/generate-text
.post("/api/generate-text", async (req, res) => {
  const { prompt } = req.body;

  // try-catch: kita coba/`try` dulu, kalau error, kita jalanin `catch`-nya
  try {
    const interaction = await ai.interactions.create({
      model: 'gemini-3.1-flash-lite',
      input: prompt,
      system_instruction: ""
    });

    return res.status(200).json({
      success: true,
      message: interaction.output_text
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Wah, ada masalah nih! Developer, tolong cek console log-nya ya!"
    });
  }
})
// endpoint 2: POST /api/process-media
.post("/api/process-media", async (req, res) => {
  const { prompt } = req.body;

  // file wajib ada, kalau tidak ada kita balas 400 (bukan 500)
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "File wajib diunggah."
    });
  }

  // ambil file dengan req.file.buffer.toString("base64");
  const base64File = req.file.buffer.toString("base64");

  // tentukan tipe file secara dinamis (image, audio, video, atau document)
  const mimeType = req.file.mimetype || "";
  let fileType = "document";
  if (mimeType.startsWith("image/")) {
    fileType = "image";
  } else if (mimeType.startsWith("audio/")) {
    fileType = "audio";
  } else if (mimeType.startsWith("video/")) {
    fileType = "video";
  }

  // try-catch: kita coba/`try` dulu, kalau error, kita jalanin `catch`-nya
  try {
    const interaction = await ai.interactions.create({
      model: 'gemini-3.1-flash-lite',
      // kita buat input-nya dalam bentuk array
      input: [
        // untuk type text, nanti kita butuh `text`
        { type: "text", text: prompt },
        // untuk type media (image/audio/video/document), kita butuh `data` dan `mime_type`
        { type: fileType, data: base64File, mime_type: mimeType }
      ]
    });

    return res.status(200).json({
      success: true,
      message: interaction.output_text
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Wah, ada masalah nih! Developer, tolong cek console log-nya ya!"
    });
  }
})
// endpoint 3: POST /api/chat (percakapan multi-turn untuk chatbot)
.post("/api/chat", async (req, res) => {
  const { conversation } = req.body;

  try {
    // validasi: harus array, tidak kosong, dan setiap item berisi role + text
    if (!Array.isArray(conversation) || conversation.length === 0) {
      return res.status(400).json({ error: "conversation harus berupa array yang tidak kosong." });
    }

    const valid = conversation.every(
      (m) => ["user", "model"].includes(m?.role) && typeof m?.text === "string" && m.text.trim() !== ""
    );
    if (!valid) {
      return res.status(400).json({ error: "Setiap pesan harus punya role ('user' atau 'model') dan text." });
    }

    // ubah ke format yang dimengerti Gemini: { role, parts: [{ text }] }
    const contents = conversation.map(({ role, text }) => ({
      role,
      parts: [{ text }]
    }));

    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents,
      config: {
        // rendah supaya hitungan lebih konsisten, tapi masih luwes saat menjelaskan
        temperature: 0.4,
        topP: 0.9,
        systemInstruction: SYSTEM_INSTRUCTION
      }
    });

    return res.status(200).json({ result: response.text });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Kak Angka lagi bingung. Coba kirim lagi ya." });
  }
})

// bungkus gan!
.listen(PORT, () => {
  console.log("Bungkus gan, di port", PORT);
});
