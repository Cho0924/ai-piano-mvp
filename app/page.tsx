"use client";

import { useState, useRef } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function PianoTeacherMVP() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('ミミ先生：準備はいいかな？');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 1. Geminiのセットアップ
  const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);
  console.log("API Key exists:", !!process.env.NEXT_PUBLIC_GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // 2. 録音開始
  const startLesson = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await analyzePerformance(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus('ミミ先生：聴いているよ！弾いてみてね。');
    } catch (err) {
      alert("マイクの使用を許可してください。");
    }
  };

  // 3. 録音停止
  const stopLesson = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setStatus('ミミ先生：うーん、今の演奏はね...');
  };

  // 4. Geminiによる演奏解析
  const analyzePerformance = async (blob: Blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(',')[1];

      const prompt = `あなたは「ミミ先生」という優しいピアノの先生です。
      送られた音声を聴いて、以下の構成で短く音声で回答してください。
      1. 演奏の素敵なところを1つ褒める
      2. 1つだけ具体的なアドバイスをする（例：もう少しゆっくり弾こう、など）
      3. 「また一緒に練習しようね」と締める。`;

      try {
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64Data, mimeType: "audio/webm" } }
        ]);
        const responseText = result.response.text();
        setStatus(`ミミ先生：${responseText}`);
        speak(responseText);
      } catch (error) {
        setStatus("ミミ先生：ごめんね、うまく聴き取れなかったみたい。もう一度聞かせて？");
      }
    };
  };

  // 5. ブラウザによる読み上げ
  const speak = (text: string) => {
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = "ja-JP";
    window.speechSynthesis.speak(uttr);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="text-center max-w-sm">
        <div className="text-8xl mb-6">{isRecording ? '👂' : '🎹'}</div>
        <h1 className="text-2xl font-bold text-blue-600 mb-2">AIピアノ先生「ミミ」</h1>
        <div className="bg-white p-6 rounded-3xl shadow-xl mb-8 min-h-[150px] flex items-center justify-center">
          <p className="text-gray-700 leading-relaxed">{status}</p>
        </div>
        
        <button
          onMouseDown={startLesson}
          onMouseUp={stopLesson}
          onTouchStart={startLesson}
          onTouchEnd={stopLesson}
          className={`w-32 h-32 rounded-full shadow-2xl flex items-center justify-center text-white text-lg font-bold transition-transform active:scale-95 ${
            isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-500'
          }`}
        >
          {isRecording ? '終了' : '押して演奏'}
        </button>
        <p className="mt-4 text-gray-400 text-sm">ボタンを押している間、先生が聴いてくれます</p>
      </div>
    </div>
  );
}