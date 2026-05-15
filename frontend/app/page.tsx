"use client";

import { useCallback, useRef, useState } from "react";

type AnalyzeResponse = {
  feedback: string;
  midi: unknown;
};

type RecorderState = {
  isRecording: boolean;
  status: string;
  feedback: string;
  midiJson: string;
};

const INITIAL_STATE: RecorderState = {
  isRecording: false,
  status: "待機中",
  feedback: "",
  midiJson: ""
};

export default function HomePage() {
  const [state, setState] = useState<RecorderState>(INITIAL_STATE);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const buffersRef = useRef<Float32Array[]>([]);
  const bufferLengthRef = useRef(0);
  const sampleRateRef = useRef(44100);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      buffersRef.current = [];
      bufferLengthRef.current = 0;
      sampleRateRef.current = audioContext.sampleRate;

      processor.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        buffersRef.current.push(new Float32Array(channelData));
        bufferLengthRef.current += channelData.length;
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      mediaStreamRef.current = stream;
      processorRef.current = processor;
      sourceRef.current = source;

      setState((prev) => ({
        ...prev,
        isRecording: true,
        status: "録音中...",
        feedback: "",
        midiJson: ""
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "マイクへのアクセスに失敗しました。"
      }));
      console.error(error);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const processor = processorRef.current;
    const source = sourceRef.current;
    const audioContext = audioContextRef.current;
    const stream = mediaStreamRef.current;

    if (processor) {
      processor.disconnect();
    }
    if (source) {
      source.disconnect();
    }
    if (audioContext) {
      await audioContext.close();
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    const wavBlob = encodeWav(
      buffersRef.current,
      bufferLengthRef.current,
      sampleRateRef.current
    );

    setState((prev) => ({
      ...prev,
      isRecording: false,
      status: "解析中..."
    }));

    await sendAudio(wavBlob);
  }, []);

  const sendAudio = useCallback(async (audioBlob: Blob) => {
    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ||
      "http://localhost:8000";
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.wav");

    try {
      const response = await fetch(`${apiBase}/analyze`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "API error");
      }

      const data = (await response.json()) as AnalyzeResponse;
      setState((prev) => ({
        ...prev,
        status: "完了",
        feedback: data.feedback,
        midiJson: JSON.stringify(data.midi, null, 2)
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "解析に失敗しました。バックエンドのログを確認してください。"
      }));
      console.error(error);
    }
  }, []);

  return (
    <main>
      <div className="container">
        <div className="header">
          <h1>AI Piano MVP</h1>
          <p>録音した演奏をMIDI解析し、「チョウ先生」がフィードバックします。</p>
        </div>

        <section className="panel">
          <div className="controls">
            <button onClick={startRecording} disabled={state.isRecording}>
              録音開始
            </button>
            <button
              className="secondary"
              onClick={stopRecording}
              disabled={!state.isRecording}
            >
              録音停止して解析
            </button>
          </div>
          <div className="status">ステータス: {state.status}</div>
        </section>

        <section className="panel">
          <h2>チョウ先生のフィードバック</h2>
          <p className="feedback">
            {state.feedback || "ここにフィードバックが表示されます。"}
          </p>
        </section>

        <section className="panel">
          <h2>MIDI JSON プレビュー</h2>
          <pre className="midi-json">
            {state.midiJson || "(解析後にJSONが表示されます)"}
          </pre>
        </section>
      </div>
    </main>
  );
}

function encodeWav(
  buffers: Float32Array[],
  totalLength: number,
  sampleRate: number
): Blob {
  const merged = mergeBuffers(buffers, totalLength);
  const wavBuffer = new ArrayBuffer(44 + merged.length * 2);
  const view = new DataView(wavBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + merged.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, merged.length * 2, true);

  let offset = 44;
  for (let i = 0; i < merged.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, merged[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

function mergeBuffers(buffers: Float32Array[], totalLength: number) {
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
