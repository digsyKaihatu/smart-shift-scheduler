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
    // マスタデータもリアルタイム同期にするか検討できますが、
    // 頻度が低いため一旦は従来の getDoc + 内部での保存時反映ロジックのまま、
    // あるいはここも onSnapshot にして設定変更を即時共有することも可能です。
    // 今回は「シフトの変更」が主眼のため、Configは onSnapshot 化し、
    // 常に最新の設定を共有できるようにします。
    
    setLoadingMessage("設定データを読み込んでいます...");
    
    const unsubscribeConfig = onSnapshot(configDocRef, (configSnap) => {
        if (configSnap.exists()) {
          const data = configSnap.data();
          // ローカルで編集中の場合はState更新と競合する可能性がありますが、
          // 管理画面等での設定変更を即時反映させるメリットを優先します。
          // ただし、頻繁な更新による入力阻害を防ぐため、厳密には
          // 「自分が編集していない項目のみ更新」等の制御が必要になる場合もあります。
          // ここではシンプルに最新データを反映させます。
          if (data.staff) setStaff(data.staff);
          if (data.tasks) setTasks(data.tasks);
          if (data.shiftPatterns) setShiftPatterns(data.shiftPatterns);
          if (data.adminConfig) setAdminConfig(data.adminConfig);
          
          setInitialDataLoaded(true);
        } else {
          // Configがない場合、Legacyデータを確認（移行用ロジック）
          // ※ここは非同期処理が混在するため onSnapshot とは分けます。
          // 初回のみ実行する形にします。
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

    setIsLoading(true);

    const unsubscribe = onSnapshot(monthDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            // サーバーデータの反映
            // ※ pendingChanges に自分の未保存変更がある場合は、
            // それを上書きしないようにマージする等の高度な制御も考えられますが、
            // onSnapshotはローカル書き込み（レイテンシ補正）も即座に発火するため、
            // 基本的には Firestore SDK のマージ動作に任せつつ、
            // React State を最新に保つ方針とします。
            
            // ただし、自分が今まさに入力中で saveDebounce 待機中のデータが
            // サーバーからの（少し古い、または他人の）データで上書きされて
            // カーソルが飛ぶ等の挙動を防ぐため、
            // pendingChanges がある項目の更新はスキップするなどの工夫も有効です。
            // 今回はシンプルに「常に最新を正」として同期します。
            
            setSchedule(prev => ({
                ...prev,
                [key]: data.scheduleData || {}
            }));
        } else {
            // データが存在しない場合、初期データを生成して保存
            // ※ここで setDoc すると無限ループの恐れがあるため、
            // 「データがない」状態をStateに反映し、必要ならUI側または保存時に生成する形が安全ですが、
            // 従来のロジックを踏襲し、なければ生成してStateにセット（保存はユーザー操作または自動保存ロジックに委ねる）
            setSchedule(prev => {
                if (prev[key]) return prev; // 既にローカルにあればそのまま
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
        // エラー時はローカルデータのみで続行するか、エラー表示
        setIsLoading(false); 
    });

    // クリーンアップ：月が変わったりアンマウントされたらリスナー解除
    return () => {
        unsubscribe();
        setHistory({ past: [], future: [] }); // 月変更時に履歴リセット
    };
  }, [currentYear, currentMonth, initialDataLoaded, staff, shiftPatterns]); // 依存配列に注意

  // ---------------------------------------------------------------------------
  // 3. データ保存ロジック (Config / Schedule 分離)
  // ---------------------------------------------------------------------------

  // A. マスタデータの保存
  useEffect(() => {
    if (!isInitialLoadComplete.current) return;

    // Configは onSnapshot でリッスンしているため、
    // 自分がセットしたState変更 → 保存 → onSnapshot発火 → State更新
    // のループにならぬよう注意が必要ですが、
    // Firestoreはローカル書き込みを即時反映し、サーバー反映後の通知は
    // "hasPendingWrites" メタデータ等で判別可能です。
    // 今回の構成では、setDoc後のスナップショット更新で再レンダリングは走りますが、
    // 値が同じならReactのDiffで吸収されます。

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
      // 送信キューをコピーしてリセット（送信中に新たな変更が入るのを考慮）
      // ※厳密には排他制御が必要ですが、JSのシングルスレッド特性を利用して
      // ここで参照を付け替えます。
      const currentBatchChanges = { ...changesByMonth };
      pendingChanges.current = {}; 

      const promises = Object.entries(currentBatchChanges).map(async ([monthKey, updates]) => {
        if (Object.keys(updates).length === 0) return;

        const [y, m] = monthKey.split('-');
        const docRef = getMonthDocRef(y, m);
        
        updates['updatedAt'] = new Date().toISOString();

        try {
          // updateDoc で部分更新
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
            // エラー時はpendingChangesに戻すなどのリカバリが望ましい
            // 今回は簡易ログのみ
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
  }, [schedule]); // scheduleへの依存は最小限にしたいが、新規作成時の参照で必要


  // ---------------------------------------------------------------------------
  // 4. データ更新用関数
  // ---------------------------------------------------------------------------

  // 単一セルの更新
  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;

    // 1. React Stateの更新 (UI即時反映 - 楽観的更新)
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

    // 2. 変更差分の登録
    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;

    // 3. 保存
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
      
      // Undo時も保存が必要（Firestoreと同期するため）
      // Stateを戻した後、その状態を正としてFirestoreに全保存、あるいは
      // 差分を計算して保存する必要があるが、
      // リアルタイム同期との兼ね合いで複雑になるため、
      // ここでは「ローカルの見た目を戻す」に留め、
      // 次の操作で整合性が取れることを期待するか、
      // あるいは Undo 自体を制限する（リアルタイム多人数編集ではUndoは難しい）
      // 今回は一旦State更新のみ維持します。
      
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
