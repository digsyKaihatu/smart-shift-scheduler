import React, { useMemo, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth, toRelativeUrl } from '@okta/okta-auth-js';
import { oktaConfig } from './config/okta';

// Components
import MainContent from './MainContent';
import LoadingScreen from './components/common/LoadingScreen';

const App = () => {
  const navigate = useNavigate();

  // OktaAuthインスタンスをメモ化し、設定値が存在する場合のみ生成する
  // 設定が空の状態で new OktaAuth() を呼ぶとアプリ全体がクラッシュするため
  const oktaAuth = useMemo(() => {
    if (!oktaConfig.issuer || !oktaConfig.clientId) {
      return null;
    }
    return new OktaAuth(oktaConfig);
  }, []);

  const restoreOriginalUri = async (_oktaAuth, originalUri) => {
    navigate(toRelativeUrl(originalUri || '/', window.location.origin));
  };

  // 設定不足時のエラー画面
  if (!oktaAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-xl border border-red-200 max-w-md w-full">
          <h2 className="text-xl font-bold text-red-600 mb-4">設定エラー</h2>
          <p className="text-slate-700 mb-4">
            Oktaの認証設定が見つかりません。<br />
            <code>.env</code> ファイルに以下の環境変数が正しく設定されているか確認してください。
          </p>
          <ul className="list-disc list-inside bg-slate-100 p-4 rounded text-sm font-mono text-slate-600">
            <li>VITE_OKTA_ISSUER</li>
            <li>VITE_OKTA_CLIENT_ID</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <Security oktaAuth={oktaAuth} restoreOriginalUri={restoreOriginalUri}>
      <Routes>
        <Route path="/login/callback" element={<LoginCallback />} />
        <Route path="/*" element={<AuthenticatedMainContent />} />
      </Routes>
    </Security>
  );
};

// 認証状態チェック用ラッパー
const AuthenticatedMainContent = () => {
  const { authState, oktaAuth } = useOktaAuth();

  useEffect(() => {
    // 認証されていない場合は自動的にログイン画面へリダイレクト
    if (authState && !authState.isAuthenticated) {
        oktaAuth.signInWithRedirect();
    }
  }, [authState, oktaAuth]);

  if (!authState || !authState.isAuthenticated) {
    return <LoadingScreen message="認証処理中..." />;
  }

  return <MainContent />;
};

export default App;
