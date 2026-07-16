// src/hooks/useShiftData.js
import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where } from "firebase/firestore";
import { db } from '../config/firebase';
import { useOktaAuth } from '@okta/okta-react'; // Oktaからユーザー情報を取得するために追加
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateScheduleForMonth } from '../utils/scheduleUtils';

// ---------------------------------------------------------------------------
// 汎用的なディープイコール関数・マージ関数
// ---------------------------------------------------------------------------
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
};

const mergeArray = (localArr, serverArr, lastServerArr) => {
  if (!lastServerArr) return serverArr;
  if (!serverArr) return localArr;
  if (!localArr) return serverArr;

  const merged = [];
  const processedServerIds = new Set();
  
  serverArr.forEach(serverItem => {
    if (!serverItem || !serverItem.id) return;
    processedServerIds.add(serverItem.id);

    const localItem = localArr.find(item => item && item.id === serverItem.id);
    const lastItem = lastServerArr.find(item => item && item.id === serverItem.id);

    if (!localItem) {
      if (!lastItem) merged.push(serverItem);
    } else if (!lastItem) {
      merged.push(localItem);
    } else {
      const isLocalChanged = !deepEqual(localItem, lastItem);
      const isServerChanged = !deepEqual(serverItem, lastItem);
      
      if (isLocalChanged && !isServerChanged) {
        merged.push(localItem); 
      } else if (!isLocalChanged && isServerChanged) {
        merged.push(serverItem); 
      } else {
        merged.push(serverItem); 
      }
    }
  });

  localArr.forEach(localItem => {
    if (localItem && localItem.id && !processedServerIds.has(localItem.id)) {
      if (!lastServerArr.find(item => item && item.id === localItem.id)) {
        merged.push(localItem);
      }
    }
  });

  return merged;
};

// ---------------------------------------------------------------------------
// Reducer定義: アプリケーションの状態を一元管理
// ---------------------------------------------------------------------------
const initialState = {
  isLoading: true,
  loadingMessage: "データベースに接続しています...",
  saveStatus: 'saved',
  initialDataLoaded: false,
  staff: [],
  summarySchedule: {}, // サマリ（確定版）データ
  individualSchedules: {}, // 各個人の下書きデータ
  tasks: [],
  shiftPatterns: [],
  adminConfig: initialAdminConfig
};

function shiftReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { 
        ...state, 
        isLoading: action.payload.isLoading, 
        loadingMessage: action.payload.message || state.loadingMessage 
      };
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload };
    case 'SET_INITIAL_DATA_LOADED':
      return { ...state, initialDataLoaded: true };
    case 'UPDATE_MASTER_DATA':
      return { ...state, ...action.payload };
    case 'SYNC_SUMMARY_SCHEDULE':
      return {
        ...state,
        summarySchedule: {
          ...state.summarySchedule,
          [action.payload.key]: action.payload.data
        }
      };
    case 'SYNC_INDIVIDUAL_SCHEDULES':
      return {
        ...state,
        individualSchedules: {
          ...state.individualSchedules,
          [action.payload.key]: action.payload.data
        }
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// メインのカスタムフック
// ---------------------------------------------------------------------------
export const useShiftData = (currentYear, currentMonth) => {
  const [state, dispatch] = useReducer(shiftReducer, initialState);
  const { authState, oktaAuth } = useOktaAuth();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  const { staff, summarySchedule, individualSchedules, tasks, shiftPatterns, adminConfig, isLoading, loadingMessage, saveStatus, initialDataLoaded } = state;

  // 最新のStateとUserを保持
  const stateRef = useRef(state);
  const userRef = useRef({ id: null, email: "", isAdmin: false });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 1. Oktaから現在ログイン中のユーザーを識別
  useEffect(() => {
    const fetchUser = async () => {
      if (authState?.isAuthenticated) {
        try {
          const info = await oktaAuth.getUser();
          setCurrentUserEmail(info.email || "");
        } catch (e) {
          console.error("Oktaユーザー取得エラー:", e);
        }
      }
    };
    fetchUser();
  }, [authState, oktaAuth]);

  // 2. マスタデータがロードされたら、ログインユーザーの staff ID を特定
  useEffect(() => {
    if (currentUserEmail && staff.length > 0) {
      const matched = staff.find(s => s.email === currentUserEmail);
      const matchedId = matched ? matched.id : (currentUserEmail === (adminConfig.adminEmails || '').split(',')[0]?.trim() ? 'admin' : 'okta-user');
      
      const adminEmails = (adminConfig.adminEmails || '').split(',').map(e => e.trim());
      const isAdmin = matchedId === 'admin' || adminEmails.includes(currentUserEmail);

      setCurrentUserId(matchedId);
      userRef.current = { id: matchedId, email: currentUserEmail, isAdmin };
    }
  }, [currentUserEmail, staff, adminConfig]);

  const debouncedSaveConfig = useRef(null);
  const isInitialLoadComplete = useRef(false);
  const pendingConfigSave = useRef(false);

  const lastServerConfigRef = useRef({
    staff: initialStaffData,
    tasks: initialTasks,
    shiftPatterns: initialShiftPatterns,
    adminConfig: initialAdminConfig
  });

  const configDocRef = doc(db, "schedules", "config");
  const getSummaryDocRef = (year, month) => doc(db, "schedules", `${year}-${month}`);
  const getIndividualDocRef = (staffId, year, month) => doc(db, "individual_schedules", `${staffId}_${year}-${month}`);

  // ---------------------------------------------------------------------------
  // ローカル更新用のラッパー関数 (schedules/configの更新)
  // ---------------------------------------------------------------------------
  const setStaff = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    const newValue = typeof value === 'function' ? value(staff) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { staff: newValue } });
  }, [staff]);

  const setTasks = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    const newValue = typeof value === 'function' ? value(tasks) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { tasks: newValue } });
  }, [tasks]);

  const setShiftPatterns = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    const newValue = typeof value === 'function' ? value(shiftPatterns) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { shiftPatterns: newValue } });
  }, [shiftPatterns]);

  const setAdminConfig = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    const newValue = typeof value === 'function' ? value(adminConfig) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { adminConfig: newValue } });
  }, [adminConfig]);

  // ---------------------------------------------------------------------------
  // 1. 設定データロード (リアルタイム同期)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let unsubscribeConfig = () => {};
    let isFirstConfigLoad = true; 

    const loadMasterData = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: { isLoading: true, message: "設定データを読み込んでいます..." } });
        const configSnap = await getDoc(configDocRef);

        if (!configSnap.exists()) {
             await setDoc(configDocRef, {
                staff: initialStaffData, 
                tasks: initialTasks, 
                shiftPatterns: initialShiftPatterns, 
                adminConfig: initialAdminConfig,
                updatedAt: new Date().toISOString()
             });
             dispatch({ type: 'UPDATE_MASTER_DATA', payload: { 
                 staff: initialStaffData, tasks: initialTasks, shiftPatterns: initialShiftPatterns, adminConfig: initialAdminConfig 
             }});
             dispatch({ type: 'SET_INITIAL_DATA_LOADED' });
             isFirstConfigLoad = false;
        }

        unsubscribeConfig = onSnapshot(configDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (lastServerConfigRef.current.updatedAt && data.updatedAt) {
                if (new Date(data.updatedAt) < new Date(lastServerConfigRef.current.updatedAt)) return;
            }

            const serverStaff = data.staff || initialStaffData;
            const serverTasks = data.tasks || initialTasks;
            const serverPatterns = data.shiftPatterns || initialShiftPatterns;
            const serverAdmin = data.adminConfig || initialAdminConfig;

            if (isFirstConfigLoad) {
                dispatch({ type: 'UPDATE_MASTER_DATA', payload: { 
                    staff: serverStaff, tasks: serverTasks, shiftPatterns: serverPatterns, adminConfig: serverAdmin 
                }});
                lastServerConfigRef.current = {
                   staff: serverStaff, tasks: serverTasks, shiftPatterns: serverPatterns, adminConfig: serverAdmin, updatedAt: data.updatedAt 
                };
                isFirstConfigLoad = false;
                dispatch({ type: 'SET_INITIAL_DATA_LOADED' });
                return;
            }

            const { staff: currentStaff, tasks: currentTasks, shiftPatterns: currentPatterns, adminConfig: currentAdminConfig } = stateRef.current;

            const isStaffEqual = deepEqual(lastServerConfigRef.current.staff, serverStaff);
            const isTasksEqual = deepEqual(lastServerConfigRef.current.tasks, serverTasks);
            const isPatternsEqual = deepEqual(lastServerConfigRef.current.shiftPatterns, serverPatterns);
            const isAdminEqual = deepEqual(lastServerConfigRef.current.adminConfig, serverAdmin);

            if (isStaffEqual && isTasksEqual && isPatternsEqual && isAdminEqual && isInitialLoadComplete.current) return;

            let newStaff = currentStaff;
            let newTasks = currentTasks;
            let newPatterns = currentPatterns;
            let newAdminConfig = currentAdminConfig;

            if (!isStaffEqual) {
                const merged = mergeArray(currentStaff, serverStaff, lastServerConfigRef.current.staff);
                newStaff = deepEqual(currentStaff, merged) ? currentStaff : merged;
            }
            if (!isTasksEqual) {
                const merged = mergeArray(currentTasks, serverTasks, lastServerConfigRef.current.tasks);
                newTasks = deepEqual(currentTasks, merged) ? currentTasks : merged;
            }
            if (!isPatternsEqual) {
                const merged = mergeArray(currentPatterns, serverPatterns, lastServerConfigRef.current.shiftPatterns);
                newPatterns = deepEqual(currentPatterns, merged) ? currentPatterns : merged;
            }
            if (!isAdminEqual) {
                const isLocalChanged = !deepEqual(currentAdminConfig, lastServerConfigRef.current.adminConfig);
                if (!isLocalChanged) newAdminConfig = serverAdmin;
            }

            dispatch({ type: 'UPDATE_MASTER_DATA', payload: { 
                staff: newStaff, tasks: newTasks, shiftPatterns: newPatterns, adminConfig: newAdminConfig 
            }});

            lastServerConfigRef.current = {
               staff: serverStaff, tasks: serverTasks, shiftPatterns: serverPatterns, adminConfig: serverAdmin, updatedAt: data.updatedAt
            };
            
            if (!isInitialLoadComplete.current) dispatch({ type: 'SET_INITIAL_DATA_LOADED' });
          }
        });
      } catch (error) {
        console.error("Master Data Load Error:", error);
      }
    };

    loadMasterData();
    return () => unsubscribeConfig();
  }, []);

  // ---------------------------------------------------------------------------
  // 2. 確定サマリデータの監視 (リアルタイム同期)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!initialDataLoaded) return;
    const key = `${currentYear}-${currentMonth}`;
    const summaryDocRef = getSummaryDocRef(currentYear, currentMonth);

    const unsubscribe = onSnapshot(summaryDocRef, (snap) => {
      let summaryData = {};
      if (snap.exists()) {
        summaryData = snap.data().scheduleData || {};
      }
      dispatch({ type: 'SYNC_SUMMARY_SCHEDULE', payload: { key, data: summaryData } });
      dispatch({ type: 'SET_LOADING', payload: { isLoading: false } });
    }, (error) => {
      console.error("Summary Schedule Load Error:", error);
    });

    return () => unsubscribe();
  }, [currentYear, currentMonth, initialDataLoaded]);

  // ---------------------------------------------------------------------------
  // 3. 個別下書きデータの監視 (リアルタイム同期) - 管理者/一般メンバーで切り替え
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!initialDataLoaded || !currentUserId) return;
    const key = `${currentYear}-${currentMonth}`;
    const isAdmin = userRef.current.isAdmin;

    let unsubscribe = () => {};

    if (isAdmin) {
      // ■ 管理者の場合：全メンバーの個別入力データをリアルタイムで監視する
      const q = query(
        collection(db, "individual_schedules"),
        where("year", "==", currentYear),
        where("month", "==", currentMonth)
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const nextIndSchedules = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.staffId) {
            nextIndSchedules[data.staffId] = data;
          }
        });
        dispatch({ type: 'SYNC_INDIVIDUAL_SCHEDULES', payload: { key, data: nextIndSchedules } });
      }, (error) => {
        console.error("Admin Individual Schedules Load Error:", error);
      });
    } else {
      // ■ 一般メンバーの場合：自分自身の個別入力データだけをリアルタイムで監視する
      const myDocRef = getIndividualDocRef(currentUserId, currentYear, currentMonth);

      unsubscribe = onSnapshot(myDocRef, (docSnap) => {
        const nextIndSchedules = {};
        if (docSnap.exists()) {
          const data = docSnap.data();
          nextIndSchedules[currentUserId] = data;
        }
        dispatch({ type: 'SYNC_INDIVIDUAL_SCHEDULES', payload: { key, data: nextIndSchedules } });
      }, (error) => {
        console.error("Member Individual Schedule Load Error:", error);
      });
    }

    return () => unsubscribe();
  }, [currentYear, currentMonth, initialDataLoaded, currentUserId]);

  // ---------------------------------------------------------------------------
  // 4. 動的合成ロジック: UIに渡す `staff` と `schedule` を動的に組み立てる
  // ---------------------------------------------------------------------------
  const key = `${currentYear}-${currentMonth}`;

  // UI用のstaffリストを合成 (提出、承認などのフラグを個別ドキュメントから結合)
  const synthesizedStaff = useMemo(() => {
    const currentMonthInds = individualSchedules[key] || {};
    return staff.map(s => {
      const indDoc = currentMonthInds[s.id] || {};
      return {
        ...s,
        shiftSubmitted: { ...s.shiftSubmitted, [key]: !!indDoc.shiftSubmitted },
        shiftRemanded: { ...s.shiftRemanded, [key]: !!indDoc.shiftRemanded },
        shiftApproved: { ...s.shiftApproved, [key]: !!indDoc.shiftApproved }
      };
    });
  }, [staff, individualSchedules, key]);

  // UI用のスケジュールを合成 (サマリと下書きをマージ)
  const synthesizedSchedule = useMemo(() => {
    const summaryData = summarySchedule[key] || {};
    const indData = individualSchedules[key] || {};
    const isAdmin = userRef.current.isAdmin;

    const finalSchedule = {};

    staff.forEach(s => {
      // 1. 各スタッフのベースとして、まずは確定サマリデータを設定
      finalSchedule[s.id] = { ...(summaryData[s.id] || {}) };

      const memberIndData = indData[s.id]?.scheduleData || {};

      if (isAdmin) {
        // ■ 管理者の場合：
        // 全員分の下書きデータが存在すれば、サマリより優先して表示する (承認前のシフトを調整してあげるため)
        if (indData[s.id]) {
          finalSchedule[s.id] = { ...finalSchedule[s.id], ...memberIndData };
        }
      } else {
        // ■ 一般メンバーの場合：
        // 自分自身の行だけは、自分の下書きデータを表示。他のメンバーの行は確定されたサマリデータのみを表示。
        if (s.id === currentUserId && indData[s.id]) {
          finalSchedule[s.id] = { ...finalSchedule[s.id], ...memberIndData };
        }
      }

      // 該当月のドキュメントもサマリも空なら初期スケジュールを生成する
      if (Object.keys(finalSchedule[s.id]).length === 0) {
        const defaultSched = generateScheduleForMonth(currentYear, currentMonth, [s], shiftPatterns)[s.id] || {};
        finalSchedule[s.id] = defaultSched;
      }
    });

    return { [key]: finalSchedule };
  }, [staff, summarySchedule, individualSchedules, key, currentUserId, currentYear, currentMonth, shiftPatterns]);

  // ---------------------------------------------------------------------------
  // 5. データ保存＆更新用関数 (UIから呼び出し)
  // ---------------------------------------------------------------------------
  
  // 個別入力ドキュメントの更新用
  const saveIndividualShiftItem = useCallback(async (staffId, year, month, day, value) => {
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    const docRef = getIndividualDocRef(staffId, year, month);
    
    try {
      const snap = await getDoc(docRef);
      const existingData = snap.exists() ? snap.data() : {
        staffId,
        year,
        month,
        scheduleData: {},
        shiftSubmitted: false,
        shiftRemanded: false,
        shiftApproved: false
      };

      const updatedScheduleData = {
        ...(existingData.scheduleData || {}),
        [day]: value
      };

      await setDoc(docRef, {
        ...existingData,
        scheduleData: updatedScheduleData,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    } catch (error) {
      console.error("個別シフト保存失敗:", error);
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
    }
  }, []);

  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    // UIを即座に更新したいが、リアルタイム同期があるので直接保存メソッドを呼ぶ
    saveIndividualShiftItem(staffId, year, month, day, value);
  }, [saveIndividualShiftItem]);

  const updateLocalShiftItem = useCallback((year, month, staffId, day, value) => {
    // 保留変更中（オレンジ表示）の一時保存。ローカルステートはリアルタイム同期で即座に反映
    saveIndividualShiftItem(staffId, year, month, day, value);
  }, [saveIndividualShiftItem]);

  // 一括でシフトを更新する処理 (一括休日設定等)
  const updateShiftItems = useCallback(async (year, month, updates) => {
    if (!updates || updates.length === 0) return;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });

    try {
      const promises = updates.map(async ({ staffId, day, value }) => {
        const docRef = getIndividualDocRef(staffId, year, month);
        const snap = await getDoc(docRef);
        const existingData = snap.exists() ? snap.data() : {
          staffId, year, month, scheduleData: {}, shiftSubmitted: false, shiftRemanded: false, shiftApproved: false
        };

        const updatedScheduleData = {
          ...(existingData.scheduleData || {}),
          [day]: value
        };

        return setDoc(docRef, {
          ...existingData,
          scheduleData: updatedScheduleData,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await Promise.all(promises);
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    } catch (error) {
      console.error("一括個別シフト保存失敗:", error);
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
    }
  }, []);

  // 個別ドキュメントのステータスを更新する関数 (提出・差戻・承認取り消しで使用)
  const updateIndividualStatus = useCallback(async (staffId, year, month, statusField, value) => {
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    const docRef = getIndividualDocRef(staffId, year, month);
    try {
      await setDoc(docRef, {
        [statusField]: value,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    } catch (e) {
      console.error("ステータス更新失敗:", e);
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
    }
  }, []);

  // ■【重要】承認時に、個別下書きからサマリオールにコピーして確定する関数
  const approveMemberShift = useCallback(async (staffId, year, month) => {
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    const indDocRef = getIndividualDocRef(staffId, year, month);
    const summaryDocRef = getSummaryDocRef(year, month);

    try {
      // 1. 個別下書きドキュメントを取得
      const indSnap = await getDoc(indDocRef);
      if (!indSnap.exists()) {
        throw new Error("下書きデータが存在しません");
      }

      const indData = indSnap.data();
      const shifts = indData.scheduleData || {};

      // 2. サマリドキュメント（2026-5等）を取得し、マージして保存
      const summarySnap = await getDoc(summaryDocRef);
      const existingSummary = summarySnap.exists() ? summarySnap.data() : { scheduleData: {} };

      const updatedSummarySchedule = {
        ...(existingSummary.scheduleData || {}),
        [staffId]: shifts
      };

      await setDoc(summaryDocRef, {
        scheduleData: updatedSummarySchedule,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 3. 個別下書きのステータスを「承認済み（shiftApproved: true）」にする
      await setDoc(indDocRef, {
        shiftApproved: true,
        shiftRemanded: false,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    } catch (e) {
      console.error("承認＆コピー処理に失敗しました:", e);
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
      throw e;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // 6. 設定データの自動保存 (マスター管理用)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isInitialLoadComplete.current || !pendingConfigSave.current) return;
    if (debouncedSaveConfig.current) clearTimeout(debouncedSaveConfig.current);

    debouncedSaveConfig.current = setTimeout(async () => {
      pendingConfigSave.current = false;
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' }); 
      
      try {
        const snap = await getDoc(configDocRef);
        const serverData = snap.exists() ? snap.data() : null;

        let dataToSave = { 
          staff, tasks, shiftPatterns, adminConfig,
          updatedAt: new Date().toISOString()
        };

        if (serverData) {
            dataToSave.staff = mergeArray(staff, serverData.staff || initialStaffData, lastServerConfigRef.current.staff);
            dataToSave.tasks = mergeArray(tasks, serverData.tasks || initialTasks, lastServerConfigRef.current.tasks);
            dataToSave.shiftPatterns = mergeArray(shiftPatterns, serverData.shiftPatterns || initialShiftPatterns, lastServerConfigRef.current.shiftPatterns);
        }

        await setDoc(configDocRef, dataToSave, { merge: true });
        
        lastServerConfigRef.current = {
            staff: dataToSave.staff, tasks: dataToSave.tasks, shiftPatterns: dataToSave.shiftPatterns,
            adminConfig: dataToSave.adminConfig, updatedAt: dataToSave.updatedAt
        };
        
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' }); 
      } catch (error) {
        console.error("Config save failed:", error);
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' }); 
      }
    }, 500);

    return () => clearTimeout(debouncedSaveConfig.current);
  }, [staff, tasks, shiftPatterns, adminConfig]);

  // タブ閉じ防止機能
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (saveStatus !== 'saved' || pendingConfigSave.current) {
        e.preventDefault();
        e.returnValue = ''; 
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  return {
    staff: synthesizedStaff, setStaff, // 合成された提出・承認フラグ付きのstaffリスト
    schedule: synthesizedSchedule, // 合成されたスケジュールを表示
    updateShiftItem,
    updateLocalShiftItem,
    updateShiftItems,
    updateIndividualStatus, // 提出・承認のステータス単体更新用
    approveMemberShift, // 【新設】個別シフトを承認しサマリにコピーする
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, 
    setLoadingMessage: (msg) => dispatch({ type: 'SET_LOADING', payload: { isLoading, message: msg } }), 
    setIsLoading: (loading) => dispatch({ type: 'SET_LOADING', payload: { isLoading: loading } }),
    saveStatus, initialDataLoaded
  };
};
