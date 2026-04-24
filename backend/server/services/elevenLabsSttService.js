const axios = require('axios');
const FormData = require('form-data');

const ELEVENLABS_API_KEY = String(process.env.ELEVENLABS_API_KEY || '').trim();
const ELEVENLABS_STT_MODEL_ID = String(process.env.ELEVENLABS_STT_MODEL_ID || 'scribe_v2').trim() || 'scribe_v2';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // keep requests bounded
const HTTP_TIMEOUT_MS = Number(process.env.ELEVENLABS_STT_TIMEOUT_MS || 20000);

const downloadToBuffer = async (url) => {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: HTTP_TIMEOUT_MS,
    maxContentLength: MAX_AUDIO_BYTES,
    maxBodyLength: MAX_AUDIO_BYTES,
    validateStatus: () => true,
  });

  if (!resp || resp.status < 200 || resp.status >= 300) {
    throw new Error(`download failed (${resp?.status || 0})`);
  }

  const buf = Buffer.from(resp.data || []);
  if (!buf.length) throw new Error('download returned empty body');
  if (buf.length > MAX_AUDIO_BYTES) throw new Error('audio too large');
  return buf;
};

const transcribeAudioUrl = async ({
  audioUrl,
  fileName = 'audio.ogg',
  mimeType = 'audio/ogg',
  languageCode = null,
  diarize = true,
  tagAudioEvents = true,
} = {}) => {
  if (!ELEVENLABS_API_KEY) return { ok: false, text: '', error: 'missing ELEVENLABS_API_KEY' };
  if (!audioUrl) return { ok: false, text: '', error: 'missing audioUrl' };

  const audioBuffer = await downloadToBuffer(String(audioUrl));

  const form = new FormData();
  form.append('model_id', ELEVENLABS_STT_MODEL_ID);
  form.append('diarize', diarize ? 'true' : 'false');
  form.append('tag_audio_events', tagAudioEvents ? 'true' : 'false');
  // scribe_v2 supports language_code; null means auto-detect.
  if (languageCode !== null && String(languageCode).trim()) form.append('language_code', String(languageCode).trim());
  form.append('file', audioBuffer, {
    filename: fileName || 'audio.ogg',
    contentType: mimeType || 'application/octet-stream',
  });

  const resp = await axios.post('https://api.elevenlabs.io/v1/speech-to-text', form, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      ...form.getHeaders(),
    },
    timeout: HTTP_TIMEOUT_MS,
    maxContentLength: MAX_AUDIO_BYTES,
    maxBodyLength: MAX_AUDIO_BYTES,
    validateStatus: () => true,
  });

  if (!resp || resp.status < 200 || resp.status >= 300) {
    const msg = typeof resp?.data === 'string' ? resp.data : JSON.stringify(resp?.data || {});
    return { ok: false, text: '', error: `elevenlabs stt failed (${resp?.status || 0}): ${msg.slice(0, 300)}` };
  }

  const text = String(resp?.data?.text || '').trim();
  return { ok: Boolean(text), text, raw: resp.data };
};

module.exports = {
  transcribeAudioUrl,
};

