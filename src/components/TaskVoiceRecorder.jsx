// Voice-note recorder for the studio's task forms — the same behaviour as the one
// in Task Management: MediaRecorder for the audio, the Web Speech API for a live
// on-screen transcript, then the task API's Groq Whisper endpoint upgrades that
// transcript (it handles Urdu/English code-switching). Emits through
// onChange(dataUrl | null, transcript | null).
import React, { useEffect, useRef, useState } from 'react';
import { taskApi } from '../utils/taskApi';

const MAX_SECONDS = 120; // hard stop so payloads stay well under the API limit

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function TaskVoiceRecorder({ value, onChange, lang = 'en-US' }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [liveText, setLiveText] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState(null);
  const generationRef = useRef(0); // invalidates late transcripts after clear/restart
  const recorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const recordingRef = useRef(false);
  const chunksRef = useRef([]);
  const transcriptRef = useRef('');
  const timerRef = useRef(null);

  const stopTimer = () => { clearInterval(timerRef.current); timerRef.current = null; };

  const stopRecognition = () => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      try { rec.stop(); } catch { /* already stopped */ }
    }
  };

  // Clean up mid-recording unmounts (panel closed while recording)
  useEffect(() => () => {
    recordingRef.current = false;
    stopTimer();
    stopRecognition();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const startRecognition = () => {
    if (!SpeechRecognitionImpl) return; // recording still works, just no live transcript
    const rn = new SpeechRecognitionImpl();
    rn.lang = lang;
    rn.continuous = true;
    rn.interimResults = true;
    rn.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) transcriptRef.current += chunk + ' ';
        else interim += chunk;
      }
      setLiveText((transcriptRef.current + interim).trim());
    };
    // Chrome stops recognition on silence — restart while we are still recording
    rn.onend = () => {
      if (recordingRef.current && recognitionRef.current === rn) {
        try { rn.start(); } catch { /* tab lost focus etc. */ }
      }
    };
    recognitionRef.current = rn;
    try { rn.start(); } catch { /* ignore */ }
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Recording is not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      transcriptRef.current = '';
      setLiveText('');
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = reader.result;
          const gen = ++generationRef.current;
          // Emit immediately with the live Web Speech transcript as fallback…
          onChange?.(dataUrl, transcriptRef.current.trim() || null);
          // …then upgrade to the server's Whisper transcript
          setTranscribing(true);
          try {
            const { transcript } = await taskApi.transcribe(dataUrl);
            if (transcript && generationRef.current === gen) onChange?.(dataUrl, transcript);
          } catch {
            /* transcription unavailable — keep the Web Speech fallback */
          } finally {
            if (generationRef.current === gen) setTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      recorderRef.current = rec;
      rec.start();
      recordingRef.current = true;
      setRecording(true);
      setSeconds(0);
      startRecognition();
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError('Microphone access denied — allow it in browser settings');
    }
  };

  const stop = () => {
    recordingRef.current = false;
    stopTimer();
    stopRecognition();
    setRecording(false);
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  const clear = () => {
    generationRef.current++;
    setTranscribing(false);
    onChange?.(null, null);
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  if (value) {
    return (
      <div className="tm-voice">
        <div className="tm-voice-row">
          <audio controls src={value} className="tm-audio" />
          <button type="button" className="tm-icon-btn tm-danger-hover" title="Delete recording" onClick={clear}>🗑</button>
        </div>
        {transcribing && <div className="tm-voice-hint">Transcribing…</div>}
      </div>
    );
  }

  if (recording) {
    return (
      <div className="tm-voice">
        <div className="tm-voice-row">
          <button type="button" className="tm-btn tm-btn-danger" onClick={stop}>■ Stop</button>
          <span className="tm-rec-time"><i className="tm-rec-dot" />{mmss}</span>
        </div>
        {liveText && <p className="tm-voice-live">{liveText}</p>}
      </div>
    );
  }

  return (
    <div className="tm-voice">
      <button type="button" className="tm-btn tm-btn-soft" onClick={start}>🎤 Record Voice Note</button>
      {error && <div className="tm-voice-err">{error}</div>}
    </div>
  );
}

export default TaskVoiceRecorder;
