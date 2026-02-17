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
    setLoadingMessage("設定データを読み込んでいます...");
    
    const unsubscribeConfig = onSnapshot(configDocRef, (configSnap) => {
        if (configSnap.exists()) {
          const data = configSnap.data();
          
          // ループ防止: 内容が同じ場合はStateを更新しない (参照の変更によるuseEffect発火を防ぐ)
          if (data.staff) {
              setStaff(prev => JSON.stringify(prev) !== JSON.stringify(data.staff) ? data.staff : prev);
          }
          if (data.tasks) {
              setTasks(prev => JSON.stringify(prev) !== JSON.stringify(data.tasks) ? data.tasks : prev);
          }
          if (data.shiftPatterns) {
              setShiftPatterns(prev => JSON.stringify(prev) !== JSON.stringify(data.shiftPatterns) ? data.shiftPatterns : prev);
          }
          if (data.adminConfig) {
              setAdminConfig(prev => JSON.stringify(prev) !== JSON.stringify(data.adminConfig) ? data.adminConfig : prev);
          }
          
          setInitialDataLoaded(true);
        } else {
          // Configがない場合、Legacyデータを確認（移行用ロジック）
          getDoc(legacyDocRef).then((legacySnap) => {
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
              setInitialDataLoaded(true);
          });
        }
    }, (error) => {
        console.error("Config Realtime Listener Error:", error);
        setLoadingMessage(`エラー: ${error.message}`);
    });

    return () => unsubscribeConfig();
  }, []);

  // ---------------------------------------------------------------------------
  // 2. 月次データロード (リアルタイム同期)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!initialDataLoaded) return;

    const key = `${currentYear}-${currentMonth}`;
    const monthDocRef = getMonthDocRef(currentYear, currentMonth);

    // 月が変更された時などはロード表示を行うが、
    // staff更新時にはここを通らないように依存配列を調整済み
    setIsLoading(true);

    const unsubscribe = onSnapshot(monthDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setSchedule(prev => ({
                ...prev,
                [key]: data.scheduleData || {}
            }));
        } else {
            setSchedule(prev => {
                if (prev[key]) return prev;
                // 注意: ここでクロージャ内の古いstaffを参照する可能性があるが、
                // データが存在しない(=新規月)かつ初期ロード直後であれば問題ない。
                return {
                    ...prev,
                    [key]: generateScheduleForMonth(currentYear, currentMonth, staff, shiftPatterns)
                };
            });
        }
        setIsLoading(false);
        isInitialLoadComplete.current = true;
    }, (error) => {
        console.error("Schedule Realtime Listener Error:", error);
        setIsLoading(false); 
    });

    // クリーンアップ：月が変わったりアンマウントされたらリスナー解除
    return () => {
        unsubscribe();
        setHistory({ past: [], future: [] }); // 月変更時に履歴リセット
    };
    // 修正: staff, shiftPatterns を依存配列から削除しました。
    // これにより、承認操作などでstaff情報が更新されても、スケジュールの再ロード(ローディング画面)が発生しません。
  }, [currentYear, currentMonth, initialDataLoaded]); 

  // ---------------------------------------------------------------------------
  // 3. データ保存ロジック (Config / Schedule 分離)
  // ---------------------------------------------------------------------------

  // A. マスタデータの保存
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

  // B. スケジュールデータの保存
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
      } catch (e) {
        setSaveStatus('error');
      }
    }, 1000); 
  }, [schedule]);


  // ---------------------------------------------------------------------------
  // 4. データ更新用関数
  // ---------------------------------------------------------------------------

  // 単一セルの更新
  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;

    setSchedule(prev => {
      const currentMonthData = prev[key] || {};
      const currentStaffData = currentMonthData[staffId] || {};
      
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
      
      setHistory(h => ({ past: [...h.past, prev], future: [] }));
      return { ...prev, [key]: newMonthData };
    });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;

    triggerScheduleSave();
  }, [triggerScheduleSave]);

  // 複数セルの更新
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

  // ユーザー月次一括更新
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

  // Undo / Redo
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
    staff, setStaff,
    schedule, 
    updateShiftItem,
    updateShiftItems,
    updateShiftUserMonth,
    undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded
  };
};
