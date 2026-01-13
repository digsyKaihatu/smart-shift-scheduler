import { useState, useEffect, useRef } from 'react';
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

  // Main State
  const [staff, setStaff] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [tasks, setTasks] = useState([]);
  const [shiftPatterns, setShiftPatterns] = useState([]);
  const [adminConfig, setAdminConfig] = useState(initialAdminConfig);

  const debouncedSave = useRef(null);
  const isInitialDataSync = useRef(true);

  // 1. Load Data with Aggregation Query
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingMessage("データの存在を確認中...");
        
        // 【集約クエリの使用】
        // スタッフコレクションのドキュメント数をカウントすることで、初期化が必要か判断します。
        // これにより、データが存在しない場合に無駄な読み取り（getDocs）を行う通信コストを削減できます。
        const staffColl = collection(db, 'staff');
        const snapshot = await getCountFromServer(staffColl);
        const count = snapshot.data().count();

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
          setStaff(loadedStaff.length > 0 ? loadedStaff : initialStaffData);

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
          // 初期データの書き込み
          await initializeDatabase();
        }
      } catch (error) {
        console.error("Firebase Load Error:", error);
        setLoadingMessage(`エラー: ${error.message}`);
        return;
      }
      setInitialDataLoaded(true);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // DB初期化関数
  const initializeDatabase = async () => {
    const batch = writeBatch(db);

    // Staff
    initialStaffData.forEach(s => {
      const ref = doc(db, 'staff', s.id);
      batch.set(ref, s);
    });

    // Tasks
    initialTasks.forEach(t => {
      const ref = doc(db, 'tasks', t.id);
      batch.set(ref, t);
    });

    // Patterns
    initialShiftPatterns.forEach(p => {
      const ref = doc(db, 'patterns', p.id);
      batch.set(ref, p);
    });

    // Config
    const configRef = doc(db, 'config', 'main');
    batch.set(configRef, initialAdminConfig);

    // Schedule
    const initialSched = generateInitialSchedule(initialStaffData, initialShiftPatterns);
    Object.entries(initialSched).forEach(([key, data]) => {
      const ref = doc(db, 'schedules', key);
      batch.set(ref, data);
    });

    await batch.commit();

    setStaff(initialStaffData);
    setTasks(initialTasks);
    setShiftPatterns(initialShiftPatterns);
    setAdminConfig(initialAdminConfig);
    setSchedule(initialSched);
  };

  // 2. Auto Save (Batch Update)
  useEffect(() => {
    if (!initialDataLoaded) return;
    if (isInitialDataSync.current) {
      isInitialDataSync.current = false;
      return;
    }

    setSaveStatus('unsaved');
    if (debouncedSave.current) clearTimeout(debouncedSave.current);

    debouncedSave.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const batch = writeBatch(db);

        // Staff
        staff.forEach(s => {
          const ref = doc(db, 'staff', s.id);
          batch.set(ref, s);
        });

        // Tasks
        tasks.forEach(t => {
          const ref = doc(db, 'tasks', t.id);
          batch.set(ref, t);
        });

        // Patterns
        shiftPatterns.forEach(p => {
          const ref = doc(db, 'patterns', p.id);
          batch.set(ref, p);
        });

        // Config
        const configRef = doc(db, 'config', 'main');
        batch.set(configRef, adminConfig);

        // Schedule (Only save loaded months)
        Object.entries(schedule).forEach(([key, data]) => {
          const ref = doc(db, 'schedules', key);
          batch.set(ref, data);
        });

        await batch.commit();
        setSaveStatus('saved');
      } catch (error) {
        console.error("Auto-save failed:", error);
        setSaveStatus('error');
      }
    }, 2000); // 保存頻度を少し下げて書き込み回数を抑制

    return () => clearTimeout(debouncedSave.current);
  }, [staff, schedule, tasks, shiftPatterns, adminConfig, initialDataLoaded]);

  return {
    staff, setStaff,
    schedule, setSchedule,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded
  };
};
