// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Navbar } from '../components/Navbar';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe('responsive primary navigation', () => {
  it('exposes all existing app areas through the mobile navigation', () => {
    const onTabChange = vi.fn();
    render(<Navbar
      activeTab="cam"
      onTabChange={onTabChange}
      onOpenTVMirror={() => undefined}
      selectedLocation="MAINZ"
      onLocationChange={() => undefined}
      selectedAgeGroup="MINIS"
      onAgeGroupChange={() => undefined}
      selectedStudent="Emma Berger"
      onStudentChange={() => undefined}
    />);

    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile Hauptnavigation' });
    expect(mobileNavigation).toBeTruthy();
    const expectedTabs = [
      ['Saal-Kamera', 'cam'],
      ['KI-Metaphern', 'metaphor'],
      ['Video-Analyse', 'analyzer'],
      ['Schüler-Historie', 'students'],
      ['Remote-Handy', 'remote'],
    ] as const;
    for (const [label, tabId] of expectedTabs) {
      expect(screen.getAllByRole('button', { name: label })).toHaveLength(2);
      const mobileButton = Array.from(mobileNavigation.querySelectorAll('button'))
        .find(button => button.getAttribute('aria-label') === label)!;
      fireEvent.click(mobileButton);
      expect(onTabChange).toHaveBeenLastCalledWith(tabId);
    }
  });

  it('marks the current mobile destination accessibly', () => {
    render(<Navbar
      activeTab="students"
      onTabChange={() => undefined}
      onOpenTVMirror={() => undefined}
      selectedLocation="MAINZ"
      onLocationChange={() => undefined}
      selectedAgeGroup="MINIS"
      onAgeGroupChange={() => undefined}
      selectedStudent="Emma Berger"
      onStudentChange={() => undefined}
    />);

    const current = screen.getByRole('navigation', { name: 'Mobile Hauptnavigation' })
      .querySelector('[aria-current="page"]');
    expect(current?.getAttribute('aria-label')).toBe('Schüler-Historie');
  });
});
