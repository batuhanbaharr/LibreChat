export interface PromptBlock {
  id: string;
  title: string;
  detectedAt: string;
  messageCount: number;
  prompts: string[];
  responses: string[];
  summary: string;
}

export const dummyBlocks: PromptBlock[] = [
  {
    id: '1',
    title: 'React Hooks Debugging',
    detectedAt: '09:14',
    messageCount: 6,
    prompts: [
      'useEffect zweimal ausgeführt, warum?',
      'wie vermeide ich das in strict mode?',
      'cleanup function richtig schreiben',
    ],
    responses: [
      'Das liegt am React Strict Mode, der Effekte im Dev-Modus doppelt ausführt...',
      'Du kannst das nicht komplett vermeiden, aber so schreibst du sichere Effekte...',
      'Eine cleanup function gibst du einfach als return aus dem Effekt zurück...',
    ],
    summary: 'Diskussion über doppelte useEffect-Ausführung im React Strict Mode und wie man Cleanup-Funktionen korrekt schreibt.',
  },
  {
    id: '2',
    title: 'LibreChat Setup',
    detectedAt: '09:42',
    messageCount: 12,
    prompts: [
      'wie starte ich backend und frontend getrennt?',
      'mongodb atlas verbindung geht nicht',
      'ip adresse whitelisten wie?',
    ],
    responses: [
      'Du brauchst zwei terminals, npm run backend:dev und npm run frontend:dev...',
      'Das liegt meistens an der IP whitelist in Atlas Network Access...',
      'Geh zu Network Access und füge deine aktuelle IP hinzu...',
    ],
    summary: 'Setup von LibreChat lokal, inklusive MongoDB Atlas Verbindung und IP-Whitelisting-Problemen.',
  },
  {
    id: '3',
    title: 'MongoDB Verbindung',
    detectedAt: '10:05',
    messageCount: 4,
    prompts: [
      'connection string format richtig?',
      'datenbank name im string ergänzen',
    ],
    responses: [
      'Der string sieht so aus: mongodb+srv://user:pass@cluster...',
      'Ja, du fügst den DB Namen direkt nach dem letzten Slash ein...',
    ],
    summary: 'Kurze Klärung zum richtigen Format des MongoDB Connection Strings.',
  },
];