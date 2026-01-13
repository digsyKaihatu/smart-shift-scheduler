import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  doc, getDoc, setDoc, 
  collection, getDocs, writeBatch, 
  getCountFromServer, query
} from "firebase/firestore";
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateInitialSchedule } from '../utils/scheduleUtils';

export const useShiftData = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("データベースに接続しています...");
  const [saveStatus, setSaveStatus] = useState('saved');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null); // エラー状態を追加

  // Main State
  const [staff, setStaff] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [tasks, setTasks] = useState([]);
  const [shiftPatterns, setShiftPatterns] = useState([]);
  const [adminConfig, setAdminConfig] = useState(initialAdminConfig);

  const debouncedSave = useRef(null);
  const isInitialDataSync = useRef(true);

  // データ読み込み処理を関数化して再利用可能にする
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setLoadingMessage("データの存在を確認中...");
      
      // 【修正ポイント】
      // staffコレクションではなく、patternsコレクションでデータの存在を確認します。
      // 初期スタッフデータ(initialStaffData)が空の場合、staffコレクションは0件のままとなり、
      // 毎回「初期化が必要」と判定されてしまう無限ループを防ぐためです。
      // patternsはinitialShiftPatternsで必ずデータが入るため、判定に適しています。
      const patternsColl = collection(db, 'patterns');
      const snapshot = await getCountFromServer(patternsColl);
      
      const count = snapshot.data().count;
      console.log(`Current patterns count: ${count}`);

      if (count > 0) {
        setLoadingMessage("データを読み込んでいます...");
        
        // コレクションからデータを並列で取得
        const [staffSnap, tasksSnap, patternsSnap, configSnap, schedulesSnap] = await Promise.all([
          getDocs(collection(db, 'staff')),
          getDocs(collection(db, 'tasks')),
          getDocs(collection(db, 'patterns')),
          getDocs(collection(db, 'config')),
          getDocs(collection(db, 'schedules'))
        ]);

        // Staff
        const loadedStaff = staffSnap.docs.map(d => d.data());
        setStaff(loadedStaff); // 空の場合は空配列のままセット

        // Tasks
        const loadedTasks = tasksSnap.docs.map(d => d.data());
        setTasks(loadedTasks.length > 0 ? loadedTasks : initialTasks);

        // Patterns
        const loadedPatterns = patternsSnap.docs.map(d => d.data());
        setShiftPatterns(loadedPatterns.length > 0 ? loadedPatterns : initialShiftPatterns);

        // Config
        if (!configSnap.empty) {
          setAdminConfig(configSnap.docs[0].data());
        }

        // Schedules (Docs are stored by "YYYY-MM")
        const loadedSchedule = {};
        schedulesSnap.docs.forEach(d => {
          loadedSchedule[d.id] = d.data();
        });
        
        // データが空なら初期データを生成
        if (Object.keys(loadedSchedule).length === 0) {
           setSchedule(generateInitialSchedule(initialStaffData, initialShiftPatterns));
        } else {
           setSchedule(loadedSchedule);
        }

      } else {
        setLoadingMessage("初回セットアップを実行中...");
        console.log("Initializing database with default data...");
        // 初期データの書き込み
        await initializeDatabase();
        console.log("Database initialization complete.");
      }
      setInitialDataLoaded(true);
    } catch (error) {
      console.error("Firebase Load Error:", error);
      setLoadError(error); // エラーを状態に保存
      setLoadingMessage(`読み込みエラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []); // 依存配列は空でOK

  // 初回マウント時にロード実行
  useEffect(() => {
    loadData();
  }, [loadData]);

  // DB初期化関数 (バッチ分割対応)
  const initializeDatabase = async () => {
    // 全ての書き込み操作を配列にまとめる
    const operations = [];

    // Staff
    initialStaffData.forEach(s => {
      const ref = doc(db, 'staff', s.id);
      operations.push({ ref, data: s });
    });

    // Tasks
    initialTasks.forEach(t => {
      const ref = doc(db, 'tasks', t.id);
      operations.push({ ref, data: t });
    });

    // Patterns
    initialShiftPatterns.forEach(p => {
      const ref = doc(db, 'patterns', p.id);
      operations.push({ ref, data: p });
    });

    // Config
    const configRef = doc(db, 'config', 'main');
    operations.push({ ref: configRef, data: initialAdminConfig });

    // Schedule
    const initialSched = generateInitialSchedule(initialStaffData, initialShiftPatterns);
    Object.entries(initialSched).forEach(([key, data]) => {
      const ref = doc(db, 'schedules', key);
      operations.push({ ref, data });
    });

    // バッチサイズ制限 (500) を考慮して分割実行
    const BATCH_SIZE = 450; 
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = operations.slice(i, i + BATCH_SIZE);
      
      chunk.forEach(op => {
        batch.set(op.ref, op.data);
      });

      await batch.commit();
    }

    setStaff(initialStaffData);
    setTasks(initialTasks);
    setShiftPatterns(initialShiftPatterns);
    setAdminConfig(initialAdminConfig);
    setSchedule(initialSched);
  };

  // 2. Auto Save (Batch Update) - 分割対応
  useEffect(() => {
    if (!initialDataLoaded || loadError) return;
    if (isInitialDataSync.current) {
      isInitialDataSync.current = false;
      return;
    }

    setSaveStatus('unsaved');
    if (debouncedSave.current) clearTimeout(debouncedSave.current);

    debouncedSave.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const operations = [];

        // Staff
        staff.forEach(s => {
          const ref = doc(db, 'staff', s.id);
          operations.push({ ref, data: s });
        });

        // Tasks
        tasks.forEach(t => {
          const ref = doc(db, 'tasks', t.id);
          operations.push({ ref, data: t });
        });

        // Patterns
        shiftPatterns.forEach(p => {
          const ref = doc(db, 'patterns', p.id);
          operations.push({ ref, data: p });
        });

        // Config
        const configRef = doc(db, 'config', 'main');
        operations.push({ ref: configRef, data: adminConfig });

        // Schedule
        Object.entries(schedule).forEach(([key, data]) => {
          const ref = doc(db, 'schedules', key);
          operations.push({ ref, data });
        });

        // バッチ分割実行
        const BATCH_SIZE = 450;
        for (let i = 0; i < operations.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = operations.slice(i, i + BATCH_SIZE);
            chunk.forEach(op => {
                batch.set(op.ref, op.data);
            });
            await batch.commit();
        }

        setSaveStatus('saved');
      } catch (error) {
        console.error("Auto-save failed:", error);
        setSaveStatus('error');
      }
    }, 2000); 

    return () => clearTimeout(debouncedSave.current);
  }, [staff, schedule, tasks, shiftPatterns, adminConfig, initialDataLoaded, loadError]);

  return {
    staff, setStaff,
    schedule, setSchedule,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded,
    loadError, 
    retryLoad: loadData 
  };
};
