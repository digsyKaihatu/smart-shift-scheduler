import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateScheduleForMonth } from '../utils/scheduleUtils';

// オブジェクトの浅い比較（順番に依存しない安全な比較）を行うユーティリティ
const isStaffDataEqual = (data1, data2) => {
  if (data1 === data2) return true;
  if (!data1 || !data2) return false;
  const keys1 = Object.keys(data1);
  const keys2 = Object.keys(data2);
  if (keys1.length !== keys2.length) return false;
  for (const k of keys1) {
    if (JSON.stringify(data1[k]) !== JSON.stringify(data2[k])) return false;
  }
  return true;
};

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
  // 通信中（保存中）の差分を保持するRef（通信タイムラグによる画面のチラつき防止用）
  const inflightChanges = useRef({});

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
  // 2. 月次データロード (リアルタイム同期付き)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!initialDataLoaded) return;

    const key = `${currentYear}-${currentMonth}`;
    const monthDocRef = getMonthDocRef(currentYear, currentMonth);

    setIsLoading(true);

    const unsubscribe = onSnapshot(monthDocRef, (monthSnap) => {
      if (monthSnap.exists()) {
        const data = monthSnap.data();
        const serverSchedule = data.scheduleData || {};

        setSchedule(prev => {
          const prevMonthData = prev[key] || {};
          let hasChange = false;
          // 新しいオブジェクトを作成するが、各スタッフの参照は維持する
          const nextMonthData = { ...prevMonthData };

          // サーバーからのデータで、ローカルと差分があるスタッフのみ更新
          Object.keys(serverSchedule).forEach(staffId => {
            const serverStaffData = serverSchedule[staffId];
            const localStaffData = prevMonthData[staffId] || {};

            // スタッフごとのデータが異なる場合のみ更新処理を行う
            if (!isStaffDataEqual(serverStaffData, localStaffData)) {
              
              // 自分が編集して送信待ち、または送信中のデータ（activeChanges）を取得
              const activeChanges = { 
                ...(inflightChanges.current[key] || {}), 
                ...(pendingChanges.current[key] || {}) 
              };
              
              let hasPendingForThisStaff = false;
              for (const activeKey in activeChanges) {
                if (activeKey.startsWith(`scheduleData.${staffId}.`)) {
                   hasPendingForThisStaff = true;
                   break;
                }
              }

              // 自分の未送信・送信中変更がなければ、サーバーのデータをそのまま採用
              if (!hasPendingForThisStaff) {
                 nextMonthData[staffId] = serverStaffData;
                 hasChange = true;
              } else {
                 // 自分の変更がある場合は、サーバーの最新データに自分の変更をマージして保持（上書き防止）
                 const mergedStaffData = { ...serverStaffData };
                 for (const activeKey in activeChanges) {
                     if (activeKey.startsWith(`scheduleData.${staffId}.`)) {
                         const dayStr = activeKey.split('.').pop();
                         mergedStaffData[dayStr] = activeChanges[activeKey];
                     }
                 }
                 // マージした結果、ローカルと差分がある場合のみ更新フラグを立てる
                 if (!isStaffDataEqual(mergedStaffData, localStaffData)) {
                     nextMonthData[staffId] = mergedStaffData;
                     hasChange = true;
                 }
              }
            }
          });

          if (hasChange) {
            return { ...prev, [key]: nextMonthData };
          }
          return prev;
        });
        
        setIsLoading(false);
      } else {
        // ドキュメントが存在しない場合はローカルで初期データを生成
        setSchedule(prev => {
          if (prev[key]) {
             setIsLoading(false);
             return prev; // 既にローカルにデータがあればそのまま
          }
          const initialSchedule = generateScheduleForMonth(currentYear, currentMonth, staff, shiftPatterns);
          setIsLoading(false);
          return {
            ...prev,
            [key]: initialSchedule
          };
        });
      }
      isInitialLoadComplete.current = true;
    }, (error) => {
      console.error("Monthly Data Load Error:", error);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [currentYear, currentMonth, initialDataLoaded, staff, shiftPatterns]);

  // ---------------------------------------------------------------------------
  // 3. データ保存ロジック (Config / Schedule 分離)
  // ---------------------------------------------------------------------------

  // A. マスタデータの保存 (Staff, Tasks, Patterns, Config)
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

  // B. スケジュールデータの保存 (差分更新＆マージ)
  const triggerScheduleSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (debouncedSaveSchedule.current) clearTimeout(debouncedSaveSchedule.current);

    debouncedSaveSchedule.current = setTimeout(async () => {
      setSaveStatus('saving');
      
      // 送信対象のデータを取得し、未送信キューからは削除
      const changesByMonth = { ...pendingChanges.current };
      pendingChanges.current = {}; 

      // 送信中の状態として保持（タイムラグ中のonSnapshotでの上書き防止用）
      inflightChanges.current = { ...inflightChanges.current };
      for (const mKey in changesByMonth) {
          inflightChanges.current[mKey] = {
              ...(inflightChanges.current[mKey] || {}),
              ...changesByMonth[mKey]
          };
      }

      const promises = Object.entries(changesByMonth).map(async ([monthKey, updates]) => {
        if (Object.keys(updates).length === 0) return;

        const [y, m] = monthKey.split('-');
        const docRef = getMonthDocRef(y, m);
        
        updates['updatedAt'] = new Date().toISOString();

        try {
          // まず updateDoc で部分更新を試みる（既存ドキュメントの場合）
          await updateDoc(docRef, updates);
        } catch (error) {
          // ドキュメントが存在しない場合 (not-found) は setDoc で作成する
          if (error.code === 'not-found') {
             const nestedData = {
               year: parseInt(y),
               month: parseInt(m),
               updatedAt: new Date().toISOString(),
               scheduleData: {}
             };
             
             for (const [key, value] of Object.entries(updates)) {
                 if (key.startsWith('scheduleData.')) {
                     const parts = key.split('.');
                     const staffId = parts[1];
                     const day = parts[2];
                     if (!nestedData.scheduleData[staffId]) {
                         nestedData.scheduleData[staffId] = {};
                     }
                     nestedData.scheduleData[staffId][day] = value;
                 }
             }

             await setDoc(docRef, nestedData, { merge: true });
          } else {
            console.error(`Schedule update failed for ${monthKey}:`, error);
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
      } finally {
        // 送信が完了したら inflight（送信中キュー）から該当分を削除する
        for (const mKey in changesByMonth) {
           if (inflightChanges.current[mKey]) {
               for (const updateKey in changesByMonth[mKey]) {
                   delete inflightChanges.current[mKey][updateKey];
               }
           }
        }
      }
    }, 1000); // 1秒デバウンス
  }, []);

  // ---------------------------------------------------------------------------
  // 4. データ更新用関数 (UIから呼び出す)
  // ---------------------------------------------------------------------------

  // 単一セルの更新
  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;

    // 1. React Stateの更新 (UI即時反映)
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

    // 2. 変更差分の登録 (Firestore用)
    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;

    // 3. 保存タイマー開始
    triggerScheduleSave();
  }, [triggerScheduleSave]);

  // 複数セルの更新 (一括更新、パターン適用など)
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

  // ユーザーの1ヶ月分のデータを丸ごと更新
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
