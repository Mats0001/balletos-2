import React, { useState } from 'react';
import { Users, Calendar, Clock, ShieldCheck, PlusCircle, TrendingUp, Target, Video, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Feather, MapPin, Sparkles, Play, Send, Search, Filter, FolderOpen, Archive } from 'lucide-react';
import { Student, Location } from '../types';

interface LessonSession {
  id: string;
  dateStr: string;
  topicTitle: string;
  focusSummary: string;
  vaganovaFocus: string;
  clipCount: number;
  year: number;
  monthStr: string;
}

interface CourseSlot {
  id: string;
  dayTime: string;
  location: Location;
  sessions: LessonSession[];
  students: StudentDetail[];
}

interface GroupEntity {
  id: string;
  groupName: string;
  courseSlots: CourseSlot[];
}

interface CategoryEntity {
  key: string;
  categoryName: string;
  groups: GroupEntity[];
}

interface StudentDetail extends Student {
  turnoutScore: number;
  axisStability: number;
  progressCurve: number[];
  todayCorrection: string;
  successPoints: string[];
  improvementPoints: string[];
  kiActionPlan: string;
  recentClips: { id: string; title: string; date: string; thumbnail: string; note: string; category: 'AUFFÄLLIG' | 'HIGHLIGHT' }[];
}

interface Props {
  selectedLocation?: Location;
  onLocationChange?: (loc: Location) => void;
}

export const StudentPortal: React.FC<Props> = ({
  selectedLocation = 'MAINZ',
  onLocationChange
}) => {
  // Studio Location Filter State
  const [activeStudioFilter, setActiveStudioFilter] = useState<'ALL' | Location>(selectedLocation);
  
  // Accordion State
  const [openCategoryKey, setOpenCategoryKey] = useState<string>('MINIS_KIDS');
  const [openGroupId, setOpenGroupId] = useState<string>('g2');
  const [openSlotId, setOpenSlotId] = useState<string>('slot2_mainz_2');
  
  // Active Selection: Either 'STUDENT', 'SESSION', or 'SESSION_SEARCH_ARCHIVE'
  const [activeViewMode, setActiveViewMode] = useState<'STUDENT' | 'SESSION' | 'SESSION_SEARCH_ARCHIVE'>('STUDENT');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('s1');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('ses1');
  
  // Session Search & Filter Engine State (for 100+ Sessions)
  const [sessionSearchQuery, setSessionSearchQuery] = useState<string>('');
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('ALL');
  
  const [showNewSessionModal, setShowNewSessionModal] = useState<boolean>(false);
  const [newSessionTitle, setNewSessionTitle] = useState<string>('Kinderballett 5–7 Jahre Session');
  const [videoFilter, setVideoFilter] = useState<'ALL' | 'AUFFÄLLIG' | 'HIGHLIGHT'>('ALL');

  // Sync studio filter
  React.useEffect(() => {
    setActiveStudioFilter(selectedLocation);
  }, [selectedLocation]);

  const handleStudioFilterChange = (filter: 'ALL' | Location) => {
    setActiveStudioFilter(filter);
    if (filter !== 'ALL' && onLocationChange) {
      onLocationChange(filter);
    }
  };

  // Student Database
  const studentDetails: Record<string, StudentDetail> = {
    s1: {
      id: 's1',
      name: 'Emma Berger',
      age: 6,
      ageGroup: 'KIDS',
      location: 'MAINZ',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
      level: 'Kinderballett 5–7 Jahre (Mainz Studio)',
      badges: ['Schwanen-Flügel Ausrichtung', 'Plié Stabilität'],
      parentName: 'Sabine Berger',
      gdprConsent: true,
      notesCount: 14,
      lastActive: 'Heute, 16:30 Uhr',
      turnoutScore: 82,
      axisStability: 79,
      progressCurve: [60, 70, 78, 82],
      todayCorrection: 'Schwanenflügel-Metapher nutzen: Knie über 2. Zeh führen',
      successPoints: ['Große Begeisterung & tolle Rücken-Aufrichtung', 'Plié-Ausführung im Sitzen vorbildlich'],
      improvementPoints: ['Füße kippen im Stehen leicht nach innen'],
      kiActionPlan: 'Schwanenflügel-Metapher nutzen: "Öffne die Knie weit zur Wand wie Flügel".',
      recentClips: [
        { id: 'c4', title: 'Plié Grundhaltung', date: '05. Aug 2026', thumbnail: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80', note: 'Tolle Aufrichtung des Rückens', category: 'HIGHLIGHT' }
      ]
    },
    s4: {
      id: 's4',
      name: 'Clara Schulze',
      age: 5,
      ageGroup: 'KIDS',
      location: 'MAINZ',
      avatar: 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=200&q=80',
      level: 'Kinderballett 5–7 Jahre (Mainz Studio)',
      badges: ['Zauberstern Balance'],
      parentName: 'Julia Schulze',
      gdprConsent: true,
      notesCount: 6,
      lastActive: 'Heute, 15:45 Uhr',
      turnoutScore: 75,
      axisStability: 70,
      progressCurve: [55, 65, 70, 75],
      todayCorrection: 'Armhaltung 5 Sek. gestreckt lassen beim Zauberstern',
      successPoints: ['Balanciert sicher auf einem Fuß', 'Rücken-Aufrichtung im Kreis vorbildlich'],
      improvementPoints: ['Armhaltung sinkt nach 3 Sekunden ab'],
      kiActionPlan: 'Zauberstern-Balance spielerisch mit 5 Sekunden Zählen üben.',
      recentClips: [
        { id: 'c5', title: 'Minis Balance Übung', date: '03. Aug 2026', thumbnail: 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=300&q=80', note: 'Schöner Eifer im Unterricht', category: 'HIGHLIGHT' }
      ]
    },
    s2: {
      id: 's2',
      name: 'Sophie Mainz',
      age: 14,
      ageGroup: 'TEENS',
      location: 'MAINZ',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
      level: 'Young Ballet 11–15 Jahre (Spitze I)',
      badges: ['En Dehors Turnout 95%', 'Pirouetten-Drehachse'],
      parentName: 'Dr. Markus Mainz',
      gdprConsent: true,
      notesCount: 28,
      lastActive: 'Heute, 17:45 Uhr',
      turnoutScore: 95,
      axisStability: 88,
      progressCurve: [72, 80, 89, 95],
      todayCorrection: 'Becken im Plié vor der Drehung fixieren',
      successPoints: ['Vertikale Drehachse 90° konstant stabil gehalten', 'Oberkörper-Aufrichtung im Adagio um +15% gesteigert'],
      improvementPoints: ['Knie-Fuß-Linie driftet 14° nach innen kurz vor Pirouetten-Ansatz'],
      kiActionPlan: 'Beim Plié vor der Drehung das linke Knie bewusst über dem 2. Zeh fixieren. Becken neutral halten.',
      recentClips: [
        { id: 'c1', title: 'Pirouette en dehors Ansatz', date: '06. Aug 2026', thumbnail: 'https://images.unsplash.com/photo-1518834107812-67b0b7c58434?auto=format&fit=crop&w=300&q=80', note: 'Knie-Fuß-Linie 14° Drift vor Drehung', category: 'AUFFÄLLIG' },
        { id: 'c2', title: 'Plié 1. Position & Turnout', date: '01. Aug 2026', thumbnail: 'https://images.unsplash.com/photo-1508807526345-15e9b5f4eaff?auto=format&fit=crop&w=300&q=80', note: 'Sehr gut 90° En Dehors gehalten', category: 'HIGHLIGHT' }
      ]
    },
    s3: {
      id: 's3',
      name: 'Mia Hoffmann',
      age: 17,
      ageGroup: 'MASTERCLASS',
      location: 'ALZEY',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      level: 'Gala-Ensemble 16+ (Master Class)',
      badges: ['Grand Jeté 180°', 'Spitzentanz Profi'],
      parentName: 'Mia Hoffmann (Volljährig)',
      gdprConsent: true,
      notesCount: 42,
      lastActive: 'Heute, 18:15 Uhr',
      turnoutScore: 98,
      axisStability: 96,
      progressCurve: [90, 94, 96, 98],
      todayCorrection: 'Fußgewölbe-Spannung auch bei schneller Coda beibehalten',
      successPoints: ['Perfekte En Dehors 90° Ausdrehung in allen 5 Positionen', 'Exzellente Spitzentanz-Spannung'],
      improvementPoints: ['Ausdauer im Pas de Quatre Coda am Ende leicht abfallend'],
      kiActionPlan: 'Fußgewölbe-Spannung auch bei schneller Repertoire-Sequenz halten.',
      recentClips: [
        { id: 'c6', title: 'Schwanensee Pas de Quatre', date: '06. Aug 2026', thumbnail: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80', note: 'Exzellente Vaganova Form', category: 'HIGHLIGHT' }
      ]
    }
  };

  // Sessions Database (scalable to 100+ sessions)
  const fullSessionDatabase: LessonSession[] = [
    { id: 'ses1', dateStr: '05. Aug 2026', topicTitle: 'Plié 1. Position & Schwanenflügel Ausrichtung', focusSummary: 'Knie über 2. Zeh führen & Rückenaufrichtung im Kreis', vaganovaFocus: 'Vaganova Armhaltung & Beckenausrichtung', clipCount: 4, year: 2026, monthStr: 'August' },
    { id: 'ses2', dateStr: '29. Juli 2026', topicTitle: 'Zauberstern Balance & Port de Bras', focusSummary: '1-Fuß-Balance & Fußgewölbe-Spannung', vaganovaFocus: 'Elementar Balance & Rhythmusgefühl', clipCount: 3, year: 2026, monthStr: 'Juli' },
    { id: 'ses3', dateStr: '22. Juli 2026', topicTitle: 'Battement Tendu & Landung bei Sauté', focusSummary: 'Leises Abrollen der Füße bei kleinen Sprüngen', vaganovaFocus: 'Fußabrollen & Sprungkraft', clipCount: 5, year: 2026, monthStr: 'Juli' },
    { id: 'ses4', dateStr: '15. Juli 2026', topicTitle: 'Grundhaltungen 1. & 2. Position', focusSummary: 'Auswärts-Drehung der Hüfte', vaganovaFocus: 'En Dehors Verankerung', clipCount: 2, year: 2026, monthStr: 'Juli' },
    { id: 'ses5', dateStr: '18. Juni 2026', topicTitle: 'Sommergala Choreografie Probe Part 1', focusSummary: 'Schwanensee Ensemble Formation & Aufstellung', vaganovaFocus: 'Bühnenpräsenz & Repertoire', clipCount: 6, year: 2026, monthStr: 'Juni' },
    { id: 'ses6', dateStr: '11. Juni 2026', topicTitle: 'Grand Jeté & Sprungvorbereitung', focusSummary: 'Plié-Anlauf & Dehnung der Leiste', vaganovaFocus: 'Vaganova Allegro', clipCount: 4, year: 2026, monthStr: 'Juni' },
    { id: 'ses7', dateStr: '14. Mai 2025', topicTitle: 'Repertoire Pas de Quatre Vaganova', focusSummary: 'Klassische Kopfhaltung & Armachsen', vaganovaFocus: 'Vaganova Stufe 3 Repertoire', clipCount: 8, year: 2025, monthStr: 'Mai' }
  ];

  // In the left tree, show ONLY the 3 most recent active sessions to keep it compact (Zero Scroll)
  const recentTreeSessions = fullSessionDatabase.slice(0, 3);

  // Hierarchy Tree
  const auroraHierarchyTree: CategoryEntity[] = [
    {
      key: 'MINIS_KIDS',
      categoryName: 'MINIS & KIDS',
      groups: [
        {
          id: 'g1',
          groupName: 'Kinderballett 3–4 Jahre',
          courseSlots: [
            { id: 'slot1_mainz_1', dayTime: 'Montag 15:30 - 16:15 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s4] },
            { id: 'slot1_alzey_1', dayTime: 'Donnerstag 15:30 - 16:15 Uhr · Studio Alzey', location: 'ALZEY', sessions: recentTreeSessions, students: [studentDetails.s4] }
          ]
        },
        {
          id: 'g2',
          groupName: 'Kinderballett 5–7 Jahre',
          courseSlots: [
            { id: 'slot2_mainz_1', dayTime: 'Montag 16:15 - 17:15 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s1, studentDetails.s4] },
            { id: 'slot2_mainz_2', dayTime: 'Dienstag 16:15 - 17:15 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s1, studentDetails.s4] },
            { id: 'slot2_alzey_1', dayTime: 'Donnerstag 16:15 - 17:15 Uhr · Studio Alzey', location: 'ALZEY', sessions: recentTreeSessions, students: [studentDetails.s1] }
          ]
        },
        {
          id: 'g3',
          groupName: 'Kinderballett 8–10 Jahre',
          courseSlots: [
            { id: 'slot3_mainz_1', dayTime: 'Dienstag 17:15 - 18:15 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s1] }
          ]
        }
      ]
    },
    {
      key: 'YOUNG_BALLET',
      categoryName: 'YOUNG BALLET',
      groups: [
        {
          id: 'g4',
          groupName: 'Young Ballet (11–15 Jahre)',
          courseSlots: [
            { id: 'slot4_mainz_1', dayTime: 'Montag 17:30 - 18:45 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s2] }
          ]
        },
        {
          id: 'g5',
          groupName: 'Spitzentanz (Spitze I & II)',
          courseSlots: [
            { id: 'slot5_mainz_1', dayTime: 'Montag 18:45 - 19:30 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s2] }
          ]
        }
      ]
    },
    {
      key: 'ADVANCED_BALLET',
      categoryName: 'ADVANCED BALLET',
      groups: [
        {
          id: 'g6',
          groupName: 'Gala-Ensemble (16+ Jahre)',
          courseSlots: [
            { id: 'slot6_mainz_1', dayTime: 'Donnerstag 19:00 - 20:30 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s3] }
          ]
        }
      ]
    },
    {
      key: 'CONTEMPORARY',
      categoryName: 'CONTEMPORARY',
      groups: [
        {
          id: 'g7',
          groupName: 'Contemporary Dance',
          courseSlots: [
            { id: 'slot7_mainz_1', dayTime: 'Mittwoch 19:30 - 20:45 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s3] }
          ]
        }
      ]
    },
    {
      key: 'OPEN_CLASSES',
      categoryName: 'OPEN CLASSES',
      groups: [
        {
          id: 'g8',
          groupName: 'Erwachsene Ballett',
          courseSlots: [
            { id: 'slot8_mainz_1', dayTime: 'Dienstag 19:00 - 20:15 Uhr · Studio Mainz', location: 'MAINZ', sessions: recentTreeSessions, students: [studentDetails.s1] }
          ]
        }
      ]
    }
  ];

  const currentStudent = studentDetails[selectedStudentId] || studentDetails.s1;
  const currentSession = fullSessionDatabase.find(s => s.id === selectedSessionId) || fullSessionDatabase[0];

  // Filter 100+ Sessions by Query and Year Filter
  const searchedSessions = fullSessionDatabase.filter(ses => {
    const matchesQuery = sessionSearchQuery === '' ||
      ses.topicTitle.toLowerCase().includes(sessionSearchQuery.toLowerCase()) ||
      ses.focusSummary.toLowerCase().includes(sessionSearchQuery.toLowerCase()) ||
      ses.vaganovaFocus.toLowerCase().includes(sessionSearchQuery.toLowerCase());
    
    const matchesYear = selectedYearFilter === 'ALL' || ses.year.toString() === selectedYearFilter;
    return matchesQuery && matchesYear;
  });

  const filteredClips = currentStudent.recentClips.filter(clip => {
    if (videoFilter === 'AUFFÄLLIG') return clip.category === 'AUFFÄLLIG';
    if (videoFilter === 'HIGHLIGHT') return clip.category === 'HIGHLIGHT';
    return true;
  });

  // Toggle Accordions
  const handleToggleCategory = (catKey: string) => {
    setOpenCategoryKey(openCategoryKey === catKey ? '' : catKey);
  };
  const handleToggleGroup = (groupId: string) => {
    setOpenGroupId(openGroupId === groupId ? '' : groupId);
  };
  const handleToggleSlot = (slotId: string) => {
    setOpenSlotId(openSlotId === slotId ? '' : slotId);
  };

  const handleSelectStudent = (stId: string) => {
    setSelectedStudentId(stId);
    setActiveViewMode('STUDENT');
  };

  const handleSelectSession = (sesId: string) => {
    setSelectedSessionId(sesId);
    setActiveViewMode('SESSION');
  };

  const handleOpenSessionSearchArchive = () => {
    setActiveViewMode('SESSION_SEARCH_ARCHIVE');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '14px', minHeight: 'calc(100vh - 32px)', height: 'calc(100dvh - 32px)', overflow: 'hidden' }}>
      
      {/* LEFT PANEL: CLEAR TREE ACCORDION */}
      <div className="monolith-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/schoenewolf_swan_logo.png" alt="Swan Logo" style={{ height: '22px', width: 'auto' }} />
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#a881bd', textTransform: 'uppercase' }}>
                AURORA SSOT
              </div>
              <div className="font-montserrat" style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>
                Unterrichtsstruktur
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowNewSessionModal(true)}
            className="btn-monolith"
            style={{ padding: '5px 8px', fontSize: '10px' }}
          >
            <PlusCircle size={11} /> + Session
          </button>
        </div>

        {/* Studio Filter (Mainz / Alzey / Alle) */}
        <div style={{ display: 'flex', gap: '3px', background: 'rgba(255,255,255,0.04)', padding: '2px', borderRadius: '8px' }}>
          <button
            onClick={() => handleStudioFilterChange('MAINZ')}
            style={{
              flex: 1, padding: '5px', borderRadius: '6px', border: 'none',
              background: activeStudioFilter === 'MAINZ' ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'transparent',
              color: '#fff', fontSize: '10px', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Mainz
          </button>
          <button
            onClick={() => handleStudioFilterChange('ALZEY')}
            style={{
              flex: 1, padding: '5px', borderRadius: '6px', border: 'none',
              background: activeStudioFilter === 'ALZEY' ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'transparent',
              color: '#fff', fontSize: '10px', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Alzey
          </button>
          <button
            onClick={() => handleStudioFilterChange('ALL')}
            style={{
              padding: '5px 8px', borderRadius: '6px', border: 'none',
              background: activeStudioFilter === 'ALL' ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: activeStudioFilter === 'ALL' ? '#fff' : 'var(--text-sub)', fontSize: '10px', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Alle
          </button>
        </div>

        {/* Vertical Tree Accordion */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {auroraHierarchyTree.map(cat => {
            const isCatOpen = openCategoryKey === cat.key;
            return (
              <div key={cat.key} style={{ background: 'rgba(255, 255, 255, 0.02)', border: isCatOpen ? '1px solid rgba(168, 129, 189, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', overflow: 'hidden' }}>
                
                {/* 1️⃣ KATEGORIE HEADER */}
                <div
                  onClick={() => handleToggleCategory(cat.key)}
                  style={{
                    padding: '10px 12px', background: isCatOpen ? 'rgba(168, 129, 189, 0.16)' : 'transparent',
                    fontSize: '11px', fontWeight: 700, color: isCatOpen ? '#ffffff' : '#c084fc', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Feather size={13} color="#c084fc" />
                    <span>{cat.categoryName}</span>
                  </div>
                  {isCatOpen ? <ChevronDown size={14} color="#a881bd" /> : <ChevronRight size={14} color="var(--text-sub)" />}
                </div>

                {/* 2️⃣ GRUPPEN */}
                {isCatOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', padding: '4px' }}>
                    {cat.groups.map(group => {
                      const isGrpOpen = openGroupId === group.id;
                      const visibleSlots = group.courseSlots.filter(s => activeStudioFilter === 'ALL' || s.location === activeStudioFilter);
                      return (
                        <div key={group.id} style={{ marginBottom: '4px' }}>
                          <div
                            onClick={() => handleToggleGroup(group.id)}
                            style={{
                              padding: '8px 10px', background: isGrpOpen ? 'rgba(168, 129, 189, 0.12)' : 'rgba(255,255,255,0.03)',
                              borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}
                          >
                            <span className="font-montserrat" style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>{group.groupName}</span>
                            {isGrpOpen ? <ChevronDown size={13} color="#a881bd" /> : <ChevronRight size={13} color="var(--text-sub)" />}
                          </div>

                          {/* 3️⃣ KURSTERMINE */}
                          {isGrpOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '8px', marginTop: '4px' }}>
                              {visibleSlots.map(slot => {
                                const isSlotOpen = openSlotId === slot.id;
                                return (
                                  <div key={slot.id} style={{ marginBottom: '4px' }}>
                                    
                                    <div
                                      onClick={() => handleToggleSlot(slot.id)}
                                      style={{
                                        padding: '7px 10px', borderRadius: '6px', margin: '2px 0',
                                        background: isSlotOpen ? 'rgba(168, 129, 189, 0.25)' : 'transparent',
                                        color: isSlotOpen ? '#fff' : 'var(--text-sub)', fontSize: '10px', fontWeight: isSlotOpen ? 700 : 500,
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={11} color="#a881bd" />
                                        <span>{slot.dayTime}</span>
                                      </div>
                                      {isSlotOpen ? <ChevronDown size={12} color="#a881bd" /> : <ChevronRight size={12} color="var(--text-sub)" />}
                                    </div>

                                    {/* 4️⃣ SCHÜLERINNEN & SESSIONS UNTER DEM KURS */}
                                    {isSlotOpen && (
                                      <div style={{ paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', borderLeft: '1px solid rgba(168,129,189,0.3)' }}>
                                        
                                        {/* SCHÜLERINNEN EINZELN ANKLICKBAR */}
                                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#a881bd', textTransform: 'uppercase', marginTop: '2px' }}>
                                          Schülerinnen ({slot.students.length}):
                                        </div>
                                        {slot.students.map(st => {
                                          const isSelected = activeViewMode === 'STUDENT' && selectedStudentId === st.id;
                                          return (
                                            <div
                                              key={st.id}
                                              onClick={() => handleSelectStudent(st.id)}
                                              style={{
                                                padding: '5px 8px',
                                                borderRadius: '6px',
                                                background: isSelected ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'rgba(255,255,255,0.04)',
                                                color: '#ffffff',
                                                fontSize: '10px',
                                                fontWeight: isSelected ? 700 : 500,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                cursor: 'pointer'
                                              }}
                                            >
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <img src={st.avatar} alt={st.name} style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }} />
                                                <span>{st.name}</span>
                                              </div>
                                              <span style={{ fontSize: '9px', opacity: 0.8 }}>{st.turnoutScore}%</span>
                                            </div>
                                          );
                                        })}

                                        {/* AKTUELLE SESSIONS (DIE LETZTEN 3 STUNDEN) */}
                                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', marginTop: '6px' }}>
                                          Aktuelle Sessions:
                                        </div>
                                        {slot.sessions.map(ses => {
                                          const isSelected = activeViewMode === 'SESSION' && selectedSessionId === ses.id;
                                          return (
                                            <div
                                              key={ses.id}
                                              onClick={() => handleSelectSession(ses.id)}
                                              style={{
                                                padding: '5px 8px',
                                                borderRadius: '6px',
                                                background: isSelected ? 'linear-gradient(135deg, #c084fc 0%, #8b5a8b 100%)' : 'rgba(255,255,255,0.04)',
                                                color: '#ffffff',
                                                fontSize: '10px',
                                                fontWeight: isSelected ? 700 : 500,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                cursor: 'pointer'
                                              }}
                                            >
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                                                <span style={{ fontSize: '10px', fontWeight: isSelected ? 700 : 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                  {ses.topicTitle}
                                                </span>
                                                <span style={{ fontSize: '9px', opacity: 0.75, color: '#c8a2c8' }}>
                                                  {ses.dateStr} · {ses.clipCount} Clips
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}

                                        {/* BUTTON FÜR SESSIONS ARCHIV & SUCHE (APPLE HIG) */}
                                        <button
                                          onClick={handleOpenSessionSearchArchive}
                                          style={{
                                            marginTop: '6px',
                                            padding: '6px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid rgba(192, 132, 252, 0.3)',
                                            background: activeViewMode === 'SESSION_SEARCH_ARCHIVE' ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'rgba(255, 255, 255, 0.05)',
                                            color: '#ffffff',
                                            fontSize: '9px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                          }}
                                        >
                                          <Archive size={12} color="#c084fc" />
                                          <span>Sessions-Archiv & Suche</span>
                                        </button>

                                      </div>
                                    )}

                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT MAIN PANEL: DYNAMIC DOSSIER / AUDIT / 100+ SESSIONS SEARCH ARCHIVE */}
      <div className="monolith-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
        
        {/* MODE A: FULL HIGH-EXECUTIVE STUDENT DOSSIER (KLICK AUF SCHÜLERIN) */}
        {activeViewMode === 'STUDENT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Student Profile Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <img
                  src={currentStudent.avatar}
                  alt={currentStudent.name}
                  style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #a881bd' }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 className="font-montserrat" style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff' }}>{currentStudent.name}</h2>
                    <span style={{ fontSize: '11px', background: 'rgba(168, 129, 189, 0.18)', color: '#c084fc', border: '1px solid rgba(168, 129, 189, 0.3)', padding: '3px 10px', borderRadius: '8px', fontWeight: 600 }}>
                      {currentStudent.location} Studio
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '3px', fontWeight: 500 }}>{currentStudent.level} ({currentStudent.age} Jahre)</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Elternkontakt: {currentStudent.parentName}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => alert(`✓ WhatsApp Feedback an ${currentStudent.parentName} gesendet!`)}
                  className="btn-monolith-secondary"
                  style={{ fontSize: '11px', padding: '8px 14px' }}
                >
                  <Send size={13} color="#a881bd" /> Eltern WhatsApp Feedback
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#30d158', background: 'rgba(48, 209, 88, 0.1)', padding: '6px 12px', borderRadius: '12px', border: '1px solid rgba(48, 209, 88, 0.25)', fontWeight: 600 }}>
                  <ShieldCheck size={14} /> DSGVO Aktiv
                </div>
              </div>
            </div>

            {/* 📈 VISUELLE LERNKURVE & SPARKLINE GRAPH */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#a881bd', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingUp size={15} color="#a881bd" /> VISUELLE LERNKURVE (4 WOCHEN FORTSCHRITT)
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#30d158', background: 'rgba(48, 209, 88, 0.12)', padding: '3px 10px', borderRadius: '8px' }}>
                  +12% Steigerung
                </span>
              </div>

              <div style={{ height: '65px', width: '100%', position: 'relative' }}>
                <svg style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  <polyline
                    fill="none" stroke="url(#mauveGradient)" strokeWidth="3"
                    points="10,55 130,42 250,24 370,10"
                  />
                  <defs>
                    <linearGradient id="mauveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#8b5a8b" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                  <circle cx="10" cy="55" r="4" fill="#8b5a8b" />
                  <circle cx="130" cy="42" r="4" fill="#a881bd" />
                  <circle cx="250" cy="24" r="4" fill="#c084fc" />
                  <circle cx="370" cy="10" r="6" fill="#ffffff" stroke="#c084fc" strokeWidth="2" />
                </svg>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-sub)', fontWeight: 600 }}>
                <span>Woche 1: 72%</span>
                <span>Woche 2: 80%</span>
                <span>Woche 3: 89%</span>
                <span style={{ color: '#ffffff', fontWeight: 700 }}>Aktuell: {currentStudent.turnoutScore}%</span>
              </div>
            </div>

            {/* 2-COLUMN ANALYSIS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ background: 'rgba(48, 209, 88, 0.06)', border: '1px solid rgba(48, 209, 88, 0.25)', padding: '14px 16px', borderRadius: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#30d158', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <CheckCircle2 size={14} /> WAS GUT LIEF (ERFOLGE):
                </div>
                <ul style={{ fontSize: '12px', color: '#f3effa', paddingLeft: '16px', lineHeight: '1.5' }}>
                  {currentStudent.successPoints.map((pt, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>{pt}</li>
                  ))}
                </ul>
              </div>

              <div style={{ background: 'rgba(255, 69, 58, 0.06)', border: '1px solid rgba(255, 69, 58, 0.25)', padding: '14px 16px', borderRadius: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#ff453a', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <AlertTriangle size={14} /> HANDLUNGSBEDARF:
                </div>
                <ul style={{ fontSize: '12px', color: '#f3effa', paddingLeft: '16px', lineHeight: '1.5' }}>
                  {currentStudent.improvementPoints.map((pt, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>{pt}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 🎯 DIDAKTIK-METAPHER FÜR NICOLE */}
            <div style={{ background: 'linear-gradient(135deg, rgba(168, 129, 189, 0.2) 0%, rgba(111, 74, 111, 0.2) 100%)', border: '1px solid rgba(168, 129, 189, 0.4)', padding: '16px 18px', borderRadius: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Target size={15} /> WAS NICOLE JETZT MIT SCHÜLERIN ÜBEN MUSS (KI-EMPFEHLUNG):
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', lineHeight: '1.5', fontStyle: 'italic' }}>
                "{currentStudent.kiActionPlan}"
              </div>
            </div>

            {/* 📹 SCHÜLERINNEN VIDEO-BIBLIOTHEK */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Video size={14} color="#a881bd" /> VIDEO-CLIPS VON {currentStudent.name.toUpperCase()} ({currentStudent.recentClips.length})
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['ALL', 'AUFFÄLLIG', 'HIGHLIGHT'] as const).map(flt => (
                    <button
                      key={flt}
                      onClick={() => setVideoFilter(flt)}
                      style={{
                        padding: '4px 10px', borderRadius: '8px', border: 'none',
                        background: videoFilter === flt ? 'rgba(168, 129, 189, 0.3)' : 'rgba(255,255,255,0.05)',
                        color: videoFilter === flt ? '#ffffff' : 'var(--text-sub)', fontSize: '10px', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      {flt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {filteredClips.map(clip => (
                  <div key={clip.id} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '14px', overflow: 'hidden' }}>
                    <div style={{ position: 'relative', height: '110px', overflow: 'hidden' }}>
                      <img src={clip.thumbnail} alt={clip.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', bottom: '6px', left: '8px', background: 'rgba(0,0,0,0.75)', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', color: '#fff', fontWeight: 600 }}>
                        {clip.date}
                      </div>
                      <div style={{ position: 'absolute', top: '6px', right: '6px', background: clip.category === 'AUFFÄLLIG' ? '#ff453a' : '#30d158', padding: '3px 8px', borderRadius: '6px', fontSize: '9px', color: '#fff', fontWeight: 700 }}>
                        {clip.category}
                      </div>
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div className="font-montserrat" style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>{clip.title}</div>
                      <div style={{ fontSize: '11px', color: '#c8a2c8', marginTop: '3px' }}>{clip.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* MODE B: SESSION VIDEO-AUDIT & REPERTOIRE (KLICK AUF EINE CONCRETE SESSION) */}
        {activeViewMode === 'SESSION' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Session Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  📅 UNTERRICHTS-SESSION · {currentSession.dateStr}
                </div>
                <h2 className="font-montserrat" style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                  {currentSession.topicTitle}
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '4px' }}>
                  Fokus: {currentSession.focusSummary}
                </div>
              </div>

              <button
                onClick={() => setShowNewSessionModal(true)}
                className="btn-monolith"
                style={{ padding: '8px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Play size={13} fill="#ffffff" /> Session Live Aufzeichnen
              </button>
            </div>

            {/* Session Vaganova Focus Card */}
            <div style={{ background: 'rgba(168, 129, 189, 0.12)', border: '1px solid rgba(168, 129, 189, 0.3)', padding: '14px 16px', borderRadius: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} /> VAGANOVA DIDAKTIK-SCHWERPUNKT DIESER STUNDE:
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginTop: '4px' }}>
                "{currentSession.vaganovaFocus}"
              </div>
            </div>

            {/* Session Camera Clips Grid */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Video size={14} color="#a881bd" /> SAAL-KAMERA-AUFZEICHNUNGEN DIESER SESSION ({currentSession.clipCount} CLIPS)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                {[
                  { id: 'sc1', title: 'Plié 1. Position & Turnout', time: '16:22 Uhr', thumbnail: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80', note: '85% der Kinder hielten die Knie-Ausrichtung vorbildlich' },
                  { id: 'sc2', title: 'Schwanenflügel Armführung', time: '16:38 Uhr', thumbnail: 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=300&q=80', note: 'Oberkörper-Aufrichtung im Kreis' },
                  { id: 'sc3', title: 'Sauté Abrollen der Füße', time: '16:55 Uhr', thumbnail: 'https://images.unsplash.com/photo-1518834107812-67b0b7c58434?auto=format&fit=crop&w=300&q=80', note: 'Leise Landung & Sprungkraft' }
                ].map(clip => (
                  <div key={clip.id} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '14px', overflow: 'hidden' }}>
                    <div style={{ position: 'relative', height: '130px', overflow: 'hidden' }}>
                      <img src={clip.thumbnail} alt={clip.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.8)', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', color: '#fff', fontWeight: 600 }}>
                        {clip.time}
                      </div>
                    </div>
                    <div style={{ padding: '12px' }}>
                      <div className="font-montserrat" style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{clip.title}</div>
                      <div style={{ fontSize: '11px', color: '#c8a2c8', marginTop: '4px' }}>{clip.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* MODE C: 100+ SESSIONS SUCH- & ARCHIV-ENGINE (NICOLE FINDET JEDE SESSION AUS JAHREN SOFORT) */}
        {activeViewMode === 'SESSION_SEARCH_ARCHIVE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Archive Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FolderOpen size={14} /> SESSIONS-ARCHIV & LERNINHALT-SUCHE
                </div>
                <h2 className="font-montserrat" style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                  Unterrichts-Sessions & Repertoire-Archiv
                </h2>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-sub)', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '10px' }}>
                {searchedSessions.length} von {fullSessionDatabase.length} Sessions gefunden
              </div>
            </div>

            {/* SEARCH & FILTER BAR (BLITZSCHNELLE SUCHE NACH TITEL, JAHREN ODER VAGANOVA THEMEN) */}
            <div style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
              
              {/* Search Query Input */}
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={15} color="#a881bd" style={{ position: 'absolute', left: '12px' }} />
                <input
                  type="text"
                  placeholder="Session-Name, Thema oder Didaktik-Stoff eingeben..."
                  value={sessionSearchQuery}
                  onChange={(e) => setSessionSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(10, 8, 14, 0.8)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '10px',
                    color: '#ffffff',
                    padding: '8px 12px 8px 36px',
                    fontSize: '12px',
                    fontFamily: 'Montserrat',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Year Filter Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={13} color="#a881bd" />
                <span style={{ fontSize: '11px', color: 'var(--text-sub)', fontWeight: 600 }}>Jahr:</span>
                {(['ALL', '2026', '2025'] as const).map(yr => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYearFilter(yr)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: selectedYearFilter === yr ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'rgba(255,255,255,0.05)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {yr === 'ALL' ? 'Alle Jahre' : yr}
                  </button>
                ))}
              </div>
            </div>

            {/* SEARCH RESULTS GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              {searchedSessions.map(ses => (
                <div
                  key={ses.id}
                  onClick={() => handleSelectSession(ses.id)}
                  style={{
                    background: selectedSessionId === ses.id ? 'linear-gradient(135deg, rgba(168, 129, 189, 0.25) 0%, rgba(139, 90, 139, 0.25) 100%)' : 'rgba(255, 255, 255, 0.03)',
                    border: selectedSessionId === ses.id ? '1px solid #a881bd' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '14px',
                    padding: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#c084fc', background: 'rgba(168,129,189,0.18)', padding: '2px 8px', borderRadius: '6px' }}>
                      📅 {ses.dateStr} ({ses.year})
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-sub)', fontWeight: 600 }}>
                      <Video size={11} color="#a881bd" /> {ses.clipCount} Clips
                    </span>
                  </div>

                  <div className="font-montserrat" style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                    {ses.topicTitle}
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-sub)' }}>
                    Fokus: {ses.focusSummary}
                  </div>

                  <div style={{ fontSize: '10px', color: '#30d158', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <Sparkles size={11} /> {ses.vaganovaFocus}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

      </div>

      {/* NEW SESSION MODAL */}
      {showNewSessionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="monolith-card" style={{ padding: '24px', width: '440px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 className="font-montserrat" style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
              + Neue Unterrichts-Session anlegen
            </h3>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#a881bd', textTransform: 'uppercase' }}>Session Titel</label>
              <input
                type="text"
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: '#fff', padding: '10px', fontSize: '13px', outline: 'none', marginTop: '6px', fontFamily: 'Montserrat' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => setShowNewSessionModal(false)} className="btn-monolith-secondary" style={{ fontSize: '11px' }}>
                Abbrechen
              </button>
              <button
                onClick={() => {
                  setShowNewSessionModal(false);
                  alert(`✓ Session "${newSessionTitle}" angelegt und mit Kamera synchronisiert!`);
                }}
                className="btn-monolith"
                style={{ fontSize: '11px' }}
              >
                Session Starten
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
