import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateInitialSchedule, generateScheduleForMonth } from '../utils/scheduleUtils';

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
  const debouncedSave = useRef(null);
  const isInitialLoadComplete = useRef(false);
  const lastLoadedMonthKey = useRef(null);

  // ドキュメント参照
  const configDocRef = doc(db, "schedules", "config"); // マスタデータ（メンバー、パターン、設定）
  const legacyDocRef = doc(db, "schedules", "main");   // 旧データ（移行用）

  // 月ごとのドキュメント参照を取得するヘルパー
  const getMonthDocRef = (year, month) => doc(db, "schedules", `${year}-${month}`);

  // ---------------------------------------------------------------------------
  // 1. 初期データロード (マスタデータ)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        setLoadingMessage("設定データを読み込んでいます...");
        
        // 新しいマスタデータを取得
        const configSnap = await getDoc(configDocRef);

        if (configSnap.exists()) {
          // 新方式のデータが存在する場合
          const data = configSnap.data();
          setStaff(data.staff || initialStaffData);
          setTasks(data.tasks || initialTasks);
          setShiftPatterns(data.shiftPatterns || initialShiftPatterns);
          setAdminConfig(data.adminConfig || initialAdminConfig);
        } else {
          // 新データがない場合、旧データ(main)を確認（マイグレーション）
          const legacySnap = await getDoc(legacyDocRef);
          if (legacySnap.exists()) {
            setLoadingMessage("データの移行処理を行っています...");
            const legacyData = legacySnap.data();
            setStaff(legacyData.staff || initialStaffData);
            setTasks(legacyData.tasks || initialTasks);
            setShiftPatterns(legacyData.shiftPatterns || initialShiftPatterns);
            setAdminConfig(legacyData.adminConfig || initialAdminConfig);
            // scheduleは後で個別に保存されるため、ここではstateには入れないでおく
            if (legacyData.schedule) {
              setSchedule(legacyData.schedule);
            }
          } else {
            // データが全くない場合（初回）
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
  // 2. 月次データロード (年月変更時に発火)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!initialDataLoaded) return;

    const loadMonthlyData = async () => {
      const key = `${currentYear}-${currentMonth}`;
      
      // すでにロード済みの月ならスキップ（キャッシュ利用）
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
          // ドキュメントがない場合、既存キャッシュがあれば維持、なければ新規生成
          setSchedule(prev => {
            if (prev[key]) return prev;
            return {
              ...prev,
              [key]: generateScheduleForMonth(currentYear, currentMonth, staff, shiftPatterns)
            };
          });
        }
        // 月移動時は履歴をリセット
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
  // 3. データ保存 (自動保存)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isInitialLoadComplete.current) return;

    setSaveStatus('unsaved');
    if (debouncedSave.current) clearTimeout(debouncedSave.current);

    debouncedSave.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const batchPromises = [];

        // A. マスタデータの保存 (config)
        batchPromises.push(setDoc(configDocRef, { 
          staff, 
          tasks, 
          shiftPatterns, 
          adminConfig,
          updatedAt: new Date().toISOString()
        }));

        // B. 月次データの保存
        // 現在表示中の月のデータのみを保存
        const currentKey = `${currentYear}-${currentMonth}`;
        if (schedule[currentKey]) {
          const monthDocRef = getMonthDocRef(currentYear, currentMonth);
          batchPromises.push(setDoc(monthDocRef, {
            year: currentYear,
            month: currentMonth,
            scheduleData: schedule[currentKey],
            updatedAt: new Date().toISOString()
          }));
        }

        await Promise.all(batchPromises);
        setSaveStatus('saved');
      } catch (error) {
        console.error("Auto-save failed:", error);
        setSaveStatus('error');
      }
    }, 1500);

    return () => clearTimeout(debouncedSave.current);
  }, [staff, tasks, shiftPatterns, adminConfig, schedule, currentYear, currentMonth]);

  // ---------------------------------------------------------------------------
  // 4. Undo / Redo 機能
  // ---------------------------------------------------------------------------

  // 履歴付きでスケジュールを更新する関数
  const updateSchedule = useCallback((newScheduleOrUpdater) => {
    setSchedule(current => {
      const nextSchedule = typeof newScheduleOrUpdater === 'function'
        ? newScheduleOrUpdater(current)
        : newScheduleOrUpdater;
      
      if (JSON.stringify(current) === JSON.stringify(nextSchedule)) {
        return current;
      }

      setHistory(prev => ({
        past: [...prev.past, current],
        future: []
      }));

      return nextSchedule;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      const { past, future } = prev;
      if (past.length === 0) return prev;

      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);

      setSchedule(previous);

      return {
        past: newPast,
        future: [schedule, ...future]
      };
    });
  }, [schedule]);

  const redo = useCallback(() => {
    setHistory(prev => {
      const { past, future } = prev;
      if (future.length === 0) return prev;

      const next = future[0];
      const newFuture = future.slice(1);

      setSchedule(next);

      return {
        past: [...past, schedule],
        future: newFuture
      };
    });
  }, [schedule]);

  return {
    staff, setStaff,
    schedule, setSchedule, 
    updateSchedule, // 履歴付き更新用
    undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded
  };
};
