import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  doc, getDoc, setDoc, 
  collection, getDocs, writeBatch, 
  getCountFromServer, query
} from "firebase/firestore";
// 認証関連を Google ログイン用に変更
import { signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from "firebase/auth";
import { db, auth } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateInitialSchedule } from '../utils/scheduleUtils';

export const useShiftData = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("データベースに接続しています...");
  const [saveStatus, setSaveStatus] = useState('saved');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  
  // 認証ユーザー情報
  const [user, setUser] = useState(null);

  // Main State
  const [staff, setStaff] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [tasks, setTasks] = useState([]);
  const [shiftPatterns, setShiftPatterns] = useState([]);
  const [adminConfig, setAdminConfig] = useState(initialAdminConfig);

  const debouncedSave = useRef(null);
  const isInitialDataSync = useRef(true);

  // 1. Auth Initialization (認証処理)
  useEffect(() => {
    setLoadingMessage("認証を確認中...");
    
    // 認証状態の監視のみを行う（自動ログインはしない）
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        console.log("Authenticated as:", currentUser.uid);
        setUser(currentUser);
      } else {
        console.log("User is signed out.");
        setUser(null);
        setLoadingMessage("ログインしてください");
        setIsLoading(false); // ログイン待ち状態としてロード完了扱いにする（画面制御のため）
      }
    });
    return () => unsubscribe();
  }, []);

  // Google ログイン関数
  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoadingMessage("Googleログイン中...");
      setIsLoading(true);
      const result = await signInWithPopup(auth, provider);
      console.log("Google sign-in successful:", result.user.uid);
      // onAuthStateChanged が発火して setUser される
    } catch (error) {
      console.error("Login Error:", error);
      setLoadError(error);
      setLoadingMessage(`ログインエラー: ${error.message}`);
      setIsLoading(false);
    }
  };

  // ログアウト関数
  const logout = async () => {
    try {
      await signOut(auth);
      setStaff([]);
      setSchedule({});
      setInitialDataLoaded(false);
      console.log("Signed out successfully");
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // 2. Data Loading
  const loadData = useCallback(async () => {
    if (!user) return; // 認証前は実行しない

    setIsLoading(true);
    setLoadError(null);
    
    try {
      setLoadingMessage("データの存在を確認中...");
      console.log("Checking for patterns collection...");
      
      const patternsColl = collection(db, 'patterns');
      
      // タイムアウト付きでカウント取得
      const countPromise = getCountFromServer(patternsColl).then(snap => snap.data().count);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout checking data")), 15000));
      
      const count = await Promise.race([countPromise, timeoutPromise]);
      
      console.log(`Current patterns count: ${count}`);

      if (count > 0) {
        setLoadingMessage("データを読み込んでいます...");
        console.log("Starting parallel data fetch...");

        // 並列取得
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
        console.log(`Loaded ${loadedStaff.length} staff members.`);
        setStaff(loadedStaff); 

        // Tasks
        const loadedTasks = tasksSnap.docs.map(d => d.data());
        console.log(`Loaded ${loadedTasks.length} tasks.`);
        setTasks(loadedTasks.length > 0 ? loadedTasks : initialTasks);

        // Patterns
        const loadedPatterns = patternsSnap.docs.map(d => d.data());
        console.log(`Loaded ${loadedPatterns.length} patterns.`);
        setShiftPatterns(loadedPatterns.length > 0 ? loadedPatterns : initialShiftPatterns);

        // Config
        if (!configSnap.empty) {
          console.log("Loaded config.");
          setAdminConfig(configSnap.docs[0].data());
        }

        // Schedules
        const loadedSchedule = {};
        schedulesSnap.docs.forEach(d => {
          loadedSchedule[d.id] = d.data();
        });
        console.log(`Loaded ${Object.keys(loadedSchedule).length} months of schedule.`);
        
        if (Object.keys(loadedSchedule).length === 0) {
           console.log("No schedule found, generating initial schedule...");
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
      
      console.log("Data load sequence finished successfully.");
      setInitialDataLoaded(true);

    } catch (error) {
      console.error("Firebase Load Error:", error);
      setLoadError(error);
      setLoadingMessage(`読み込みエラー: ${error.message}`);
    } finally {
      // 成功しても失敗しても必ずローディングを解除
      console.log("Disabling loading state...");
      setIsLoading(false); 
    }
  }, [user]); // userに依存

  // user認証完了後にロード開始
  useEffect(() => {
    if (user && !initialDataLoaded) {
      loadData();
    }
  }, [user, loadData, initialDataLoaded]);

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
    // userチェックを追加 (認証済みでないと保存不可)
    if (!initialDataLoaded || loadError || !user) return; 
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
  }, [staff, schedule, tasks, shiftPatterns, adminConfig, initialDataLoaded, loadError, user]);

  return {
    staff, setStaff,
    schedule, setSchedule,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded,
    loadError, 
    retryLoad: loadData,
    login,   // ログイン関数をエクスポート
    logout,  // ログアウト関数をエクスポート
    user     // ユーザー情報をエクスポート
  };
};
