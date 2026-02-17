import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth, toRelativeUrl } from '@okta/okta-auth-js';
import { oktaConfig } from './config/okta';

// Components
import MainContent from './MainContent';
import LoadingScreen from './components/common/LoadingScreen';

const oktaAuth = new OktaAuth(oktaConfig);

const App = () => {
  const navigate = useNavigate();
  const restoreOriginalUri = async (_oktaAuth, originalUri) => {
    navigate(toRelativeUrl(originalUri || '/', window.location.origin));
  };

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
  const { authState } = useOktaAuth();

  if (!authState) {
    return <LoadingScreen message="認証状態を確認中..." />;
  }

  if (!authState.isAuthenticated) {
    const { oktaAuth } = useOktaAuth();
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF9F6] p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Smart Shift Scheduler</h1>
          <p className="text-sm text-slate-500 mb-6">関係者専用ログイン</p>
          <button onClick={() => oktaAuth.signInWithRedirect()} className="w-full py-2 px-4 bg-[#F4B896] text-white rounded-md shadow hover:bg-[#E8A680] font-semibold transition-colors">Oktaでログイン</button>
        </div>
      </div>
    );
  }

  return <MainContent />;
};

export default App;
