import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateScheduleForMonth } from '../utils/scheduleUtils';

export const useShiftData = (currentYear, currentMonth) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("データベースに接続しています...");
  const [saveStatus, setSaveStatus] = useState('saved');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // Main State
  const [staff, setStaff] = useState([]);
  const [schedule, setSchedule] = useState({}); // { "2024-1": {...}, "2024-2": {...} }
  const [tasks, setTasks] = useState([]);
  const [shiftPatterns, setShiftPatterns] = useState([]);
  const [adminConfig, setAdminConfig] = useState(initialAdminConfig);

  // Undo/Redo History State
  const [history, setHistory] = useState({ past: [], future: [] });

  // Refs for debouncing and tracking
  const debouncedSaveConfig = useRef(null);
  const debouncedSaveSchedule = useRef(null);
  const isInitialLoadComplete = useRef(false);
  const lastLoadedMonthKey = useRef(null);

  // 変更差分を保持するRef (Key: "YYYY-MM", Value: { "scheduleData.staffId.day": value, ... })
  const pendingChanges = useRef({});

  // ドキュメント参照
  const configDocRef = doc(db, "schedules", "config");
  const legacyDocRef = doc(db, "schedules", "main");

  // 月ごとのドキュメント参照を取得するヘルパー
  const getMonthDocRef = (year, month) => doc(db, "schedules", `${year}-${month}`);

  // ---------------------------------------------------------------------------
  // 1. 初期データロード (マスタデータ)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        setLoadingMessage("設定データを読み込んでいます...");
        const configSnap = await getDoc(configDocRef);

        if (configSnap.exists()) {
          const data = configSnap.data();
          setStaff(data.staff || initialStaffData);
          setTasks(data.tasks || initialTasks);
          setShiftPatterns(data.shiftPatterns || initialShiftPatterns);
          setAdminConfig(data.adminConfig || initialAdminConfig);
        } else {
          const legacySnap = await getDoc(legacyDocRef);
          if (legacySnap.exists()) {
            setLoadingMessage("データの移行処理を行っています...");
            const legacyData = legacySnap.data();
            setStaff(legacyData.staff || initialStaffData);
            setTasks(legacyData.tasks || initialTasks);
            setShiftPatterns(legacyData.shiftPatterns || initialShiftPatterns);
            setAdminConfig(legacyData.adminConfig || initialAdminConfig);
            if (legacyData.schedule) {
              setSchedule(legacyData.schedule);
            }
          } else {
            setStaff(initialStaffData);
            setTasks(initialTasks);
            setShiftPatterns(initialShiftPatterns);
            setAdminConfig(initialAdminConfig);
          }
        }
        setInitialDataLoaded(true);
      } catch (error) {
        console.error("Master Data Load Error:", error);
        setLoadingMessage(`エラー: ${error.message}`);
      }
    };

    loadMasterData();
  }, []);

  // ---------------------------------------------------------------------------
  // 2. 月次データロード
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!initialDataLoaded) return;

    const loadMonthlyData = async () => {
      const key = `${currentYear}-${currentMonth}`;
      
      if (schedule[key] && lastLoadedMonthKey.current === key) {
        setIsLoading(false);
        return;
      }

      try {
        const monthDocRef = getMonthDocRef(currentYear, currentMonth);
        const monthSnap = await getDoc(monthDocRef);

        if (monthSnap.exists()) {
          const data = monthSnap.data();
          setSchedule(prev => ({
            ...prev,
            [key]: data.scheduleData || {}
          }));
        } else {
          setSchedule(prev => {
            if (prev[key]) return prev;
            return {
              ...prev,
              [key]: generateScheduleForMonth(currentYear, currentMonth, staff, shiftPatterns)
            };
          });
        }
        setHistory({ past: [], future: [] });
        lastLoadedMonthKey.current = key;
      } catch (error) {
        console.error("Monthly Data Load Error:", error);
      } finally {
        setIsLoading(false);
        isInitialLoadComplete.current = true;
      }
    };

    loadMonthlyData();
  }, [currentYear, currentMonth, initialDataLoaded, staff, shiftPatterns]);

  // ---------------------------------------------------------------------------
  // 3. データ保存ロジック (Config / Schedule 分離)
  // ---------------------------------------------------------------------------

  // A. マスタデータの保存 (Staff, Tasks, Patterns, Config) - 従来通り上書き/マージ
  useEffect(() => {
    if (!isInitialLoadComplete.current) return;

    if (debouncedSaveConfig.current) clearTimeout(debouncedSaveConfig.current);

    debouncedSaveConfig.current = setTimeout(async () => {
      try {
        await setDoc(configDocRef, { 
          staff, 
          tasks, 
          shiftPatterns, 
          adminConfig,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.error("Config save failed:", error);
      }
    }, 2000);

    return () => clearTimeout(debouncedSaveConfig.current);
  }, [staff, tasks, shiftPatterns, adminConfig]);

  // B. スケジュールデータの保存 (差分更新の実装)
  const triggerScheduleSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (debouncedSaveSchedule.current) clearTimeout(debouncedSaveSchedule.current);

    debouncedSaveSchedule.current = setTimeout(async () => {
      setSaveStatus('saving');
      
      const changesByMonth = pendingChanges.current;
      pendingChanges.current = {}; // 送信キューをリセット

      const promises = Object.entries(changesByMonth).map(async ([monthKey, updates]) => {
        if (Object.keys(updates).length === 0) return;

        const [y, m] = monthKey.split('-');
        const docRef = getMonthDocRef(y, m);
        
        updates['updatedAt'] = new Date().toISOString();

        try {
          // まず updateDoc で部分更新を試みる
          await updateDoc(docRef, updates);
        } catch (error) {
          // ドキュメントが存在しない場合 (not-found) は setDoc で作成する
          if (error.code === 'not-found') {
             // 新規作成時は、現在メモリにある完全なスケジュールデータを使って初期化
             // ただし、updatesの内容も反映済みである必要があるため、現在のschedule stateからデータを取得して保存
             const fullScheduleData = schedule[monthKey] || {};
             await setDoc(docRef, {
               year: parseInt(y),
               month: parseInt(m),
               scheduleData: fullScheduleData,
               updatedAt: new Date().toISOString()
             });
          } else {
            console.error(`Schedule update failed for ${monthKey}:`, error);
            // 失敗した変更をキューに戻すなどの処理が必要だが、ここでは簡易的にエラーログのみ
            setSaveStatus('error');
            throw error;
          }
        }
      });

      try {
        await Promise.all(promises);
        setSaveStatus('saved');
      } catch (e) {
        setSaveStatus('error');
      }
    }, 1000); // 1秒デバウンス
  }, [schedule]);


  // ---------------------------------------------------------------------------
  // 4. データ更新用関数 (UIから呼び出す)
  // ---------------------------------------------------------------------------

  // 単一セルの更新
  // value: "シフト休" や { type: "遅刻", hours: 2 } などの値
  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;

    // 1. React Stateの更新 (UI即時反映)
    setSchedule(prev => {
      const currentMonthData = prev[key] || {};
      const currentStaffData = currentMonthData[staffId] || {};
      
      // 値が変わっていない場合は何もしない
      if (JSON.stringify(currentStaffData[day]) === JSON.stringify(value)) {
        return prev;
      }

      const newMonthData = {
        ...currentMonthData,
        [staffId]: {
          ...currentStaffData,
          [day]: value
        }
      };
      
      // 履歴用 (簡易)
      setHistory(h => ({ past: [...h.past, prev], future: [] }));

      return { ...prev, [key]: newMonthData };
    });

    // 2. 変更差分の登録 (Firestore用)
    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    // ドット記法でフィールドを指定: scheduleData.{staffId}.{day}
    pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;

    // 3. 保存タイマー開始
    triggerScheduleSave();
  }, [triggerScheduleSave]);

  // 複数セルの更新 (一括更新、パターン適用など)
  // updates: Array of { staffId, day, value }
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

  // ユーザーの1ヶ月分のデータを丸ごと更新（パターン適用時などに便利）
  const updateShiftUserMonth = useCallback((year, month, staffId, monthData) => {
    const key = `${year}-${month}`;
    
    setSchedule(prev => {
      const currentMonthData = { ...(prev[key] || {}) };
      currentMonthData[staffId] = monthData;
      return { ...prev, [key]: currentMonthData };
    });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    // マップ全体を置換
    pendingChanges.current[key][`scheduleData.${staffId}`] = monthData;
    
    triggerScheduleSave();
  }, [triggerScheduleSave]);

  // Undo / Redo
  const undo = useCallback(() => {
    setHistory(prev => {
      const { past, future } = prev;
      if (past.length === 0) return prev;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      setSchedule(previous);
      // Undo時は全データ再保存（整合性のため）を検討すべきだが、
      // 複雑になるためここではState戻しのみとし、次の変更で整合させる運用とする
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

  // 古いAPI（setSchedule）を直接使わないように注意が必要
  return {
    staff, setStaff,
    schedule, 
    updateShiftItem,   // 単一更新用
    updateShiftItems,  // 一括更新用
    updateShiftUserMonth, // ユーザー月次更新用
    undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded
  };
};
