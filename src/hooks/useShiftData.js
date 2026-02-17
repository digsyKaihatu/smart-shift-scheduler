import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateScheduleForMonth } from '../utils/scheduleUtils';

export const useShiftData = (currentYear, currentMonth) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("データベースに接続しています...");
  const [saveStatus, setSaveStatus] = useState('saved');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // Main State (内部更新用セッターは _set プレフィックス)
  const [staff, _setStaff] = useState([]);
  const [schedule, setSchedule] = useState({}); 
  const [tasks, _setTasks] = useState([]);
  const [shiftPatterns, _setShiftPatterns] = useState([]);
  const [adminConfig, _setAdminConfig] = useState(initialAdminConfig);

  // Undo/Redo History
  const [history, setHistory] = useState({ past: [], future: [] });

  // Refs
  const debouncedSaveConfig = useRef(null);
  const debouncedSaveSchedule = useRef(null);
  const isInitialLoadComplete = useRef(false);
  
  // 保存処理用に最新のステートをRefで保持
  const latestConfig = useRef({ staff: [], tasks: [], shiftPatterns: [], adminConfig: initialAdminConfig });

  useEffect(() => {
    latestConfig.current = { staff, tasks, shiftPatterns, adminConfig };
  }, [staff, tasks, shiftPatterns, adminConfig]);
  
  const pendingChanges = useRef({});

  // Firestore Refs
  const configDocRef = doc(db, "schedules", "config");
  const legacyDocRef = doc(db, "schedules", "main");
  const getMonthDocRef = (year, month) => doc(db, "schedules", `${year}-${month}`);

  // --- 0. Config Saving (Manual Trigger) ---
  const triggerConfigSave = useCallback(() => {
    if (!isInitialLoadComplete.current) return;
    
    setSaveStatus('unsaved');
    if (debouncedSaveConfig.current) clearTimeout(debouncedSaveConfig.current);
    
    debouncedSaveConfig.current = setTimeout(async () => {
        setSaveStatus('saving');
        const { staff, tasks, shiftPatterns, adminConfig } = latestConfig.current;
        try {
            await setDoc(configDocRef, { 
                staff, tasks, shiftPatterns, adminConfig,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            setSaveStatus('saved');
        } catch (error) {
            console.error("Config save failed:", error);
            setSaveStatus('error');
        }
    }, 2000);
  }, []);

  const setStaff = useCallback((value) => {
      _setStaff(prev => (typeof value === 'function' ? value(prev) : value));
      triggerConfigSave();
  }, [triggerConfigSave]);

  const setTasks = useCallback((value) => {
      _setTasks(prev => (typeof value === 'function' ? value(prev) : value));
      triggerConfigSave();
  }, [triggerConfigSave]);

  const setShiftPatterns = useCallback((value) => {
      _setShiftPatterns(prev => (typeof value === 'function' ? value(prev) : value));
      triggerConfigSave();
  }, [triggerConfigSave]);

  const setAdminConfig = useCallback((value) => {
      _setAdminConfig(prev => (typeof value === 'function' ? value(prev) : value));
      triggerConfigSave();
  }, [triggerConfigSave]);

  // --- 1. Initial Load (Master Data) ---
  useEffect(() => {
    setLoadingMessage("設定データを読み込んでいます...");
    
    const unsubscribeConfig = onSnapshot(configDocRef, (configSnap) => {
        if (configSnap.metadata.hasPendingWrites) return;

        if (configSnap.exists()) {
          const data = configSnap.data();
          if (data.staff) _setStaff(prev => JSON.stringify(prev) !== JSON.stringify(data.staff) ? data.staff : prev);
          if (data.tasks) _setTasks(prev => JSON.stringify(prev) !== JSON.stringify(data.tasks) ? data.tasks : prev);
          if (data.shiftPatterns) _setShiftPatterns(prev => JSON.stringify(prev) !== JSON.stringify(data.shiftPatterns) ? data.shiftPatterns : prev);
          if (data.adminConfig) _setAdminConfig(prev => JSON.stringify(prev) !== JSON.stringify(data.adminConfig) ? data.adminConfig : prev);
          
          setInitialDataLoaded(true);
        } else {
          getDoc(legacyDocRef).then((legacySnap) => {
              if (legacySnap.exists()) {
                const legacyData = legacySnap.data();
                _setStaff(legacyData.staff || initialStaffData);
                _setTasks(legacyData.tasks || initialTasks);
                _setShiftPatterns(legacyData.shiftPatterns || initialShiftPatterns);
                _setAdminConfig(legacyData.adminConfig || initialAdminConfig);
                if (legacyData.schedule) setSchedule(legacyData.schedule);
                triggerConfigSave();
              } else {
                _setStaff(initialStaffData);
                _setTasks(initialTasks);
                _setShiftPatterns(initialShiftPatterns);
                _setAdminConfig(initialAdminConfig);
              }
              setInitialDataLoaded(true);
          });
        }
    }, (error) => {
        console.error("Config Listener Error:", error);
        setInitialDataLoaded(true);
        setLoadingMessage(`エラー: ${error.message}`);
    });

    return () => unsubscribeConfig();
  }, [triggerConfigSave]);

  // --- 2. Monthly Schedule Load ---
  useEffect(() => {
    if (!initialDataLoaded) return;

    const key = `${currentYear}-${currentMonth}`;
    const monthDocRef = getMonthDocRef(currentYear, currentMonth);

    setIsLoading(true);

    const unsubscribe = onSnapshot(monthDocRef, (docSnap) => {
        if (docSnap.metadata.hasPendingWrites) return;

        if (docSnap.exists()) {
            const data = docSnap.data();
            setSchedule(prev => ({ ...prev, [key]: data.scheduleData || {} }));
        } else {
            setSchedule(prev => {
                if (prev[key]) return prev;
                return { ...prev, [key]: generateScheduleForMonth(currentYear, currentMonth, staff, shiftPatterns) };
            });
        }
        setIsLoading(false);
        isInitialLoadComplete.current = true;
    }, (error) => {
        console.error("Schedule Listener Error:", error);
        setIsLoading(false); 
    });

    return () => {
        unsubscribe();
        setHistory({ past: [], future: [] });
    };
  }, [currentYear, currentMonth, initialDataLoaded]); 

  // --- 3. Schedule Saving ---
  const triggerScheduleSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (debouncedSaveSchedule.current) clearTimeout(debouncedSaveSchedule.current);

    debouncedSaveSchedule.current = setTimeout(async () => {
      setSaveStatus('saving');
      const changesByMonth = pendingChanges.current;
      const currentBatchChanges = { ...changesByMonth };
      pendingChanges.current = {}; 

      const promises = Object.entries(currentBatchChanges).map(async ([monthKey, updates]) => {
        if (Object.keys(updates).length === 0) return;
        const [y, m] = monthKey.split('-');
        const docRef = getMonthDocRef(y, m);
        updates['updatedAt'] = new Date().toISOString();

        try {
          await updateDoc(docRef, updates);
        } catch (error) {
          if (error.code === 'not-found') {
             const fullScheduleData = schedule[monthKey] || {};
             await setDoc(docRef, {
               year: parseInt(y),
               month: parseInt(m),
               scheduleData: fullScheduleData,
               updatedAt: new Date().toISOString()
             });
          } else {
            console.error(`Schedule update failed for ${monthKey}:`, error);
            setSaveStatus('error');
          }
        }
      });

      try {
        await Promise.all(promises);
        setSaveStatus('saved');
      } catch (e) { setSaveStatus('error'); }
    }, 1000); 
  }, [schedule]);

  // --- 4. Updaters ---
  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;
    setSchedule(prev => {
      const currentMonthData = prev[key] || {};
      const currentStaffData = currentMonthData[staffId] || {};
      if (JSON.stringify(currentStaffData[day]) === JSON.stringify(value)) return prev;
      const newMonthData = { ...currentMonthData, [staffId]: { ...currentStaffData, [day]: value } };
      setHistory(h => ({ past: [...h.past, prev], future: [] }));
      return { ...prev, [key]: newMonthData };
    });
    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;
    triggerScheduleSave();
  }, [triggerScheduleSave]);

  const updateShiftItems = useCallback((year, month, updates) => {
    if (!updates || updates.length === 0) return;
    const key = `${year}-${month}`;
    setSchedule(prev => {
      const currentMonthData = { ...(prev[key] || {}) };
      let hasChange = false;
      updates.forEach(({ staffId, day, value }) => {
        if (!currentMonthData[staffId]) currentMonthData[staffId] = {};
        if (JSON.stringify(currentMonthData[staffId][day]) !== JSON.stringify(value)) {
           currentMonthData[staffId] = { ...currentMonthData[staffId], [day]: value };
           hasChange = true;
        }
      });
      if (!hasChange) return prev;
      setHistory(h => ({ past: [...h.past, prev], future: [] }));
      return { ...prev, [key]: currentMonthData };
    });
    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    updates.forEach(({ staffId, day, value }) => {
      pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;
    });
    triggerScheduleSave();
  }, [triggerScheduleSave]);

  const updateShiftUserMonth = useCallback((year, month, staffId, monthData) => {
    const key = `${year}-${month}`;
    setSchedule(prev => {
      const currentMonthData = { ...(prev[key] || {}) };
      currentMonthData[staffId] = monthData;
      return { ...prev, [key]: currentMonthData };
    });
    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    pendingChanges.current[key][`scheduleData.${staffId}`] = monthData;
    triggerScheduleSave();
  }, [triggerScheduleSave]);

  const undo = useCallback(() => {
    setHistory(prev => {
      const { past, future } = prev;
      if (past.length === 0) return prev;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      setSchedule(previous);
      return { past: newPast, future: [schedule, ...future] };
    });
  }, [schedule]);

  const redo = useCallback(() => {
    setHistory(prev => {
      const { past, future } = prev;
      if (future.length === 0) return prev;
      const next = future[0];
      const newFuture = future.slice(1);
      setSchedule(next);
      return { past: [...past, schedule], future: newFuture };
    });
  }, [schedule]);

  return {
    staff, setStaff, schedule, 
    updateShiftItem, updateShiftItems, updateShiftUserMonth,
    undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    tasks, setTasks, shiftPatterns, setShiftPatterns, adminConfig, setAdminConfig, 
    isLoading, loadingMessage, setLoadingMessage, setIsLoading, saveStatus, initialDataLoaded
  };
};
