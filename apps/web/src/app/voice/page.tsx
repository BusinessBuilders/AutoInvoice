'use client';

import { trpc } from '@/lib/trpc';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Mode = 'tally' | 'immediate';

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
}

export default function VoiceInvoicePage() {
  const router = useRouter();

  // State
  const [mode, setMode] = useState<Mode>('tally');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [jobName, setJobName] = useState('');
  const [textInput, setTextInput] = useState('');
  const [transcription, setTranscription] = useState('');
  const [parsedResult, setParsedResult] = useState<any>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [confirmationAudio, setConfirmationAudio] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
  });
  const [showTallies, setShowTallies] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // tRPC queries
  const { data: customers } = trpc.customer.list.useQuery({ limit: 100 });
  const { data: openTallies, refetch: refetchTallies } = trpc.tally.listOpen.useQuery();

  // tRPC mutations
  const processVoice = trpc.voice.process.useMutation();
  const parseWithFeedback = trpc.voice.parseWithFeedback.useMutation();
  const speakText = trpc.voice.speak.useMutation();
  const finalizeTally = trpc.tally.finalize.useMutation();

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (audioChunksRef.current.length > 0) {
          await processRecording();
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setRecordingState({ isRecording: true, isPaused: false, duration: 0 });

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingState(prev => ({
          ...prev,
          duration: prev.duration + 1
        }));
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Microphone access denied. Please enable microphone access.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState.isRecording) {
      mediaRecorderRef.current.stop();
      setRecordingState({ isRecording: false, isPaused: false, duration: 0 });
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Process the recording
  const processRecording = async () => {
    setIsProcessing(true);
    setError('');
    setParsedResult(null);
    setTranscription('');
    setConfirmationText('');
    setConfirmationAudio(null);

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );

      const result = await processVoice.mutateAsync({
        audioBase64: base64,
        mode,
        customerId: selectedCustomerId || undefined,
        jobName: jobName || undefined,
      });

      setTranscription(result.transcription);
      setParsedResult(result.parsed);
      setConfirmationText(result.confirmation.text);
      setConfirmationAudio(result.confirmation.audioBase64 || null);

      // Auto-play confirmation
      if (result.confirmation.audioBase64) {
        playAudio(result.confirmation.audioBase64);
      }

      // Refresh tallies if we added to one
      if (result.action === 'added_to_tally') {
        refetchTallies();
      }

    } catch (err: any) {
      console.error('Processing error:', err);
      setError(err.message || 'Failed to process voice input');
    } finally {
      setIsProcessing(false);
    }
  };

  // Process text input
  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;

    setIsProcessing(true);
    setError('');
    setParsedResult(null);
    setTranscription(textInput);
    setConfirmationText('');
    setConfirmationAudio(null);

    try {
      const result = await parseWithFeedback.mutateAsync({
        text: textInput,
        mode,
        customerId: selectedCustomerId || undefined,
        jobName: jobName || undefined,
        generateAudio: true,
      });

      setParsedResult(result.parsed);
      setConfirmationText(result.confirmation.text);
      setConfirmationAudio(result.confirmation.audioBase64 || null);

      // Auto-play confirmation
      if (result.confirmation.audioBase64) {
        playAudio(result.confirmation.audioBase64);
      }

      // Refresh tallies if we added to one
      if (result.action === 'added_to_tally') {
        refetchTallies();
      }

      // Clear input on success
      if (result.action !== 'error' && result.action !== 'needs_customer') {
        setTextInput('');
      }

    } catch (err: any) {
      console.error('Processing error:', err);
      setError(err.message || 'Failed to process text input');
    } finally {
      setIsProcessing(false);
    }
  };

  // Play audio
  const playAudio = (base64Audio: string) => {
    try {
      const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
      audioRef.current = audio;
      audio.play();
    } catch (err) {
      console.error('Failed to play audio:', err);
    }
  };

  // Finalize a tally
  const handleFinalizeTally = async (tallyId: string) => {
    try {
      const invoice = await finalizeTally.mutateAsync({ tallyId });
      router.push(`/invoices/${invoice.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to finalize tally');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Voice Invoice</h1>
          </div>
          <button
            onClick={() => setShowTallies(!showTallies)}
            className="px-4 py-2 text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            Tallies ({openTallies?.length || 0})
          </button>
        </div>

        {/* Customer Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 shadow">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Customer (optional)
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">Auto-detect from voice...</option>
            {customers?.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>

          {/* Job Name / Location */}
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Job Name / Location <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="e.g. Downtown Office, Warehouse #3..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">Leave blank for residential</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 shadow">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Mode
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="tally"
                checked={mode === 'tally'}
                onChange={() => setMode('tally')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Add to Tally</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="immediate"
                checked={mode === 'immediate'}
                onChange={() => setMode('immediate')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Create Invoice Now</span>
            </label>
          </div>
        </div>

        {/* Recording Button */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 mb-4 shadow flex flex-col items-center">
          <button
            onClick={recordingState.isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
              recordingState.isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isProcessing ? (
              <svg className="animate-spin h-12 w-12 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : recordingState.isRecording ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            )}
          </button>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            {isProcessing
              ? 'Processing...'
              : recordingState.isRecording
              ? `Recording ${formatDuration(recordingState.duration)}`
              : 'Tap to record'}
          </p>
        </div>

        {/* Text Input Alternative */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 shadow">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Or type your entry
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
              placeholder="e.g., 500 sqft hydroseed for Blair"
              disabled={isProcessing}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <button
              onClick={handleTextSubmit}
              disabled={isProcessing || !textInput.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Transcription Display */}
        {transcription && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 shadow">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Transcription</h3>
            <p className="text-gray-900 dark:text-white italic">&quot;{transcription}&quot;</p>
          </div>
        )}

        {/* Parsed Result */}
        {parsedResult && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 shadow">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Parsed Items</h3>
            <ul className="space-y-2">
              {parsedResult.lineItems?.map((item: any, index: number) => (
                <li key={index} className="flex justify-between text-gray-900 dark:text-white">
                  <span>{item.service?.name || item.description}: {item.quantity} {item.unit}</span>
                  <span className="font-medium">${item.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {parsedResult.customer && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Customer: {parsedResult.customer.name}
              </p>
            )}
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              Total: ${parsedResult.total?.toFixed(2)}
            </p>
          </div>
        )}

        {/* Confirmation with Audio */}
        {confirmationText && (
          <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4 mb-4 shadow border border-green-200 dark:border-green-700">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔊</span>
              <p className="flex-1 text-green-800 dark:text-green-200">{confirmationText}</p>
              {confirmationAudio && (
                <button
                  onClick={() => playAudio(confirmationAudio)}
                  className="p-2 bg-green-200 dark:bg-green-700 rounded-full hover:bg-green-300 dark:hover:bg-green-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-800 dark:text-green-200" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Open Tallies Panel */}
        {showTallies && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 shadow">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Open Tallies</h3>
            {openTallies && openTallies.length > 0 ? (
              <ul className="space-y-4">
                {openTallies.map((tally) => (
                  <li key={tally.id} className="border dark:border-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {tally.customer.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {tally.itemCount} items
                        </p>
                      </div>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        ${Number(tally.subtotal).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Link
                        href={`/invoices/tally/${tally.id}`}
                        className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleFinalizeTally(tally.id)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Create Invoice
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">No open tallies</p>
            )}
          </div>
        )}

        {/* Quick Links */}
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/quick-manual"
            className="text-green-600 dark:text-green-400 hover:underline font-medium"
          >
            Manual Quick Invoice (No AI)
          </Link>
          <Link
            href="/quick"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Text-only Quick Entry
          </Link>
          <Link
            href="/invoices"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            View All Invoices
          </Link>
        </div>
      </div>
    </div>
  );
}
