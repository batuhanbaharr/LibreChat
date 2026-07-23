import { useState, useEffect } from 'react';
import axios from 'axios';

export interface DetectedBlock {
  title: string;
  detectedAt: string;
  conversationId: string;
  messageCount: number;
}

// holt die echten blocks vom backend
// nutzt axios statt fetch, weil librechat den auth token dort automatisch setzt
export function useBlocks() {
  const [blocks, setBlocks] = useState<DetectedBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get('/api/blocks')
      .then((res) => {
        setBlocks(res.data.blocks || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { blocks, loading, error };
}