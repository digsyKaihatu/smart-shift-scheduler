import { useState, useEffect, useMemo } from 'react';
import { useOktaAuth } from '@okta/okta-react';

/**
 * ユーザーの認証状態、プロフィール、管理者権限を管理するフック
 */
export const useUserStatus = (staff, adminConfig, initialDataLoaded) => {
  const { oktaAuth, authState } = useOktaAuth();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const identifyUser = async () => {
      if (authState?.isAuthenticated) {
        try {
          const userInfo = await oktaAuth.getUser();
          const matchedStaff = staff.find(s => s.email === userInfo.email);
          if (matchedStaff) {
            setCurrentUser({ ...matchedStaff, email: userInfo.email });
          } else {
            setCurrentUser({
              id: 'okta-user',
              name: userInfo.name || 'Okta User',
              email: userInfo.email,
              role: 'OP'
            });
          }
        } catch (error) {
          console.error("User identification failed:", error);
          // エラーが発生した場合も、ロード画面で止まらないように最低限のユーザーをセット
          setCurrentUser({
              id: 'error-user',
              name: 'Unknown User',
              email: '',
              role: 'OP'
          });
        }
      } else {
        setCurrentUser(null);
      }
    };

    // staffの有無ではなく、マスタデータの初期ロード完了を条件にして実行する
    if (authState?.isAuthenticated && initialDataLoaded) {
      identifyUser();
    }
  }, [authState, oktaAuth, staff, initialDataLoaded]);

  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.id === 'admin') return true;

    if (!adminConfig?.adminEmails) return false;
    const adminEmails = adminConfig.adminEmails.split(',').map(email => email.trim());
    return adminEmails.includes(currentUser.email);
  }, [currentUser, adminConfig]);

  return {
    currentUser,
    isAdmin,
    isAuthenticated: authState?.isAuthenticated,
    authState
  };
};
