import { describe, it, expect } from 'vitest';
import { API_VERSION, MAX_PRS, FILTER, STORAGE_KEY, MSG, ALARM_NAME } from '../core/constants.js';

describe('constants', () => {
  it('exports API_VERSION as a string', () => {
    expect(typeof API_VERSION).toBe('string');
    expect(API_VERSION).toMatch(/^\d+\.\d+/);
  });

  it('exports MAX_PRS as a positive integer', () => {
    expect(MAX_PRS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_PRS)).toBe(true);
  });

  describe('FILTER', () => {
    it('is frozen', () => {
      expect(Object.isFrozen(FILTER)).toBe(true);
    });

    it('has all expected keys', () => {
      expect(FILTER).toHaveProperty('ALL');
      expect(FILTER).toHaveProperty('NEEDS_REVIEW');
      expect(FILTER).toHaveProperty('APPROVED');
      expect(FILTER).toHaveProperty('MY_PR');
      expect(FILTER).toHaveProperty('DONE');
    });
  });

  describe('STORAGE_KEY', () => {
    it('is frozen', () => {
      expect(Object.isFrozen(STORAGE_KEY)).toBe(true);
    });

    it('has all required config keys', () => {
      expect(STORAGE_KEY.ORGANIZATION).toBeDefined();
      expect(STORAGE_KEY.PROJECT).toBeDefined();
      expect(STORAGE_KEY.TEAM).toBeDefined();
      expect(STORAGE_KEY.PAT).toBeDefined();
      expect(STORAGE_KEY.DONE_PR_IDS).toBeDefined();
    });
  });

  describe('MSG', () => {
    it('has AUTO_REFRESH message type', () => {
      expect(MSG.AUTO_REFRESH).toBe('AUTO_REFRESH');
    });
  });

  it('exports ALARM_NAME as a non-empty string', () => {
    expect(typeof ALARM_NAME).toBe('string');
    expect(ALARM_NAME.length).toBeGreaterThan(0);
  });
});
