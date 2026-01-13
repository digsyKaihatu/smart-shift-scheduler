import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  doc, getDoc, setDoc, 
  collection, getDocs, writeBatch, 
  getCountFromServer, query
} from "firebase/firestore";
// 認証関連のインポートを削除
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateInitialSchedule } from '../utils/scheduleUtils';

export const useShiftData = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("データベースに接続しています...");
  const [saveStatus, setSaveStatus] = useState('saved');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  
  // 認証ユーザー情報は使用しない
  // const [user, setUser] = useState(null);

  // Main State
  const [staff, setStaff] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [tasks, setTasks] = useState([]);
  const [shiftPatterns, setShiftPatterns] = useState([]);
  const [adminConfig, setAdminConfig] = useState(initialAdminConfig);

  const debouncedSave = useRef(null);
  const isInitialDataSync = useRef(true);

  // 1. Auth Initialization (削除: 認証なしで直接ロード)
  
  // 2. Data Loading
  const loadData = useCallback(async () => {
    // 認証チェックを削除
    // if (!user) return; 

    setIsLoading(true);
    setLoadError(null);
    
    try {
      setLoadingMessage("データの存在を確認中...");
      
      const patternsColl = collection(db, 'patterns');
      const snapshot = await getCountFromServer(patternsColl);
      const count = snapshot.data().count;
      
      console.log(`Current patterns count: ${count}`);

      if (count > 0) {
        setLoadingMessage("データを読み込んでいます...");
        console.log("Starting parallel data fetch...");

        const staffPromise = getDocs(collection(db, 'staff'));
        const tasksPromise = getDocs(collection(db, 'tasks'));
        const patternsPromise = getDocs(collection(db, 'patterns'));
        const configPromise = getDocs(collection(db, 'config'));
        const schedulesPromise = getDocs(collection(db, 'schedules'));

        const [staffSnap, tasksSnap, patternsSnap, configSnap, schedulesSnap] = await Promise.all([
          staffPromise, tasksPromise, patternsPromise, configPromise, schedulesPromise
        ]);

        console.log("Fetch complete. Processing data...");

        // Staff
        const loadedStaff = staffSnap.docs.map(d => d.data());
        setStaff(loadedStaff); 

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

        // Schedules
        const loadedSchedule = {};
        schedulesSnap.docs.forEach(d => {
          loadedSchedule[d.id] = d.data();
        });
        
        if (Object.keys(loadedSchedule).length === 0) {
           setSchedule(generateInitialSchedule(initialStaffData, initialShiftPatterns));
        } else {
           setSchedule(loadedSchedule);
        }

      } else {
        setLoadingMessage("初回セットアップを実行中...");
        console.log("Initializing database...");
        await initializeDatabase();
        console.log("Database initialized.");
      }
      
      setInitialDataLoaded(true);
      setIsLoading(false); // ここで完了とする

    } catch (error) {
      console.error("Firebase Load Error:", error);
      setLoadError(error);
      setLoadingMessage(`読み込みエラー: ${error.message}`);
      setIsLoading(false); // エラー時もローディング解除
    }
  }, []); // user依存を削除

  // 初回マウント時に即座にロード開始 (user待機なし)
  useEffect(() => {
    if (!initialDataLoaded) {
      loadData();
    }
  }, [loadData, initialDataLoaded]);

  // DB初期化関数
  const initializeDatabase = async () => {
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

    // バッチ分割実行 (450件ずつ)
    const BATCH_SIZE = 450;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = operations.slice(i, i + BATCH_SIZE);
      chunk.forEach(op => batch.set(op.ref, op.data));
      await batch.commit();
    }

    setStaff(initialStaffData);
    setTasks(initialTasks);
    setShiftPatterns(initialShiftPatterns);
    setAdminConfig(initialAdminConfig);
    setSchedule(initialSched);
  };

  // 3. Auto Save
  useEffect(() => {
    // userチェックを削除
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

        const BATCH_SIZE = 450;
        for (let i = 0; i < operations.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = operations.slice(i, i + BATCH_SIZE);
            chunk.forEach(op => batch.set(op.ref, op.data));
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
