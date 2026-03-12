/**
 * YomiToku Client Tests
 *
 * Unit tests for YomiToku API client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YomiTokuClient, getYomiTokuClient, isYomiTokuAvailable, resetYomiTokuClient } from './yomitokuClient';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('YomiTokuClient', () => {
  let client: YomiTokuClient;

  beforeEach(() => {
    vi.clearAllMocks();
    resetYomiTokuClient();
    client = new YomiTokuClient({ apiUrl: 'http://localhost:8000' });
  });

  describe('healthCheck', () => {
    it('should return health status when API is available', async () => {
      const mockHealth = {
        status: 'healthy',
        version: '1.0.0',
        yomitoku_available: true,
        device: 'cpu',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth,
      });

      const result = await client.healthCheck();

      expect(result).toEqual(mockHealth);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw error when API is unavailable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Service Unavailable',
      });

      await expect(client.healthCheck()).rejects.toThrow('Health check failed');
    });
  });

  describe('getSupportedFormats', () => {
    it('should return supported formats', async () => {
      const mockFormats = {
        input_formats: ['pdf', 'png', 'jpg'],
        output_formats: ['json', 'markdown'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFormats,
      });

      const result = await client.getSupportedFormats();

      expect(result).toEqual(mockFormats);
    });
  });

  describe('extractTextFromPdf', () => {
    it('should extract text from PDF', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-123',
          status: 'pending',
          message: 'submitted',
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-123',
          status: 'completed',
          progress: 100,
          message: 'done',
          result: '# Test Document\n\nThis is test content.',
          created_at: new Date().toISOString(),
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-123',
          status: 'completed',
          progress: 100,
          message: 'done',
          result: '# Test Document\n\nThis is test content.',
          created_at: new Date().toISOString(),
        }),
      });

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const result = await client.extractTextFromPdf(file);

      expect(result).toBe('# Test Document\n\nThis is test content.');
    });

    it('should call progress callback during extraction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-456',
          status: 'pending',
          message: 'submitted',
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-456',
          status: 'completed',
          progress: 100,
          message: 'done',
          result: '# Test',
          created_at: new Date().toISOString(),
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-456',
          status: 'completed',
          progress: 100,
          message: 'done',
          result: '# Test',
          created_at: new Date().toISOString(),
        }),
      });

      const onProgress = vi.fn();
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

      await client.extractTextFromPdf(file, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('should throw error on failed extraction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        text: async () => 'Processing failed',
      });

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

      await expect(client.extractTextFromPdf(file)).rejects.toThrow();
    });

    it('should return job metadata from extractJsonDocument', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-json',
          status: 'pending',
          message: 'submitted',
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-json',
          status: 'completed',
          progress: 100,
          message: 'done',
          result: '[{\"text_blocks\":[{\"text\":\"hello\"}]}]',
          created_at: new Date().toISOString(),
          pages: 1,
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-json',
          status: 'completed',
          progress: 100,
          message: 'done',
          result: '[{\"text_blocks\":[{\"text\":\"hello\"}]}]',
          created_at: new Date().toISOString(),
          pages: 1,
        }),
      });

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const result = await client.extractJsonDocument(file);

      expect(result.jobId).toBe('job-json');
      expect(result.result).toContain('text_blocks');
      expect(result.status.pages).toBe(1);
    });
  });

  describe('getYomiTokuClient', () => {
    it('should return singleton instance', () => {
      const client1 = getYomiTokuClient();
      const client2 = getYomiTokuClient();

      expect(client1).toBe(client2);
    });
  });

  describe('isYomiTokuAvailable', () => {
    it('should return true when API is healthy', async () => {
      const mockHealth = {
        status: 'healthy',
        version: '1.0.0',
        yomitoku_available: true,
        device: 'cpu',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth,
      });

      const result = await isYomiTokuAvailable();

      expect(result).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await isYomiTokuAvailable();

      expect(result).toBe(false);
    });
  });
});
