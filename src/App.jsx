import React, { useEffect } from 'react'; // useEffectを追加
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth, toRelativeUrl } from '@okta/okta-auth-js';
import { oktaConfig } from './config/okta';

// Components
import MainContent from './MainContent';
import LoadingScreen from './components/common/LoadingScreen';

const oktaAuth = new OktaAuth(oktaConfig);

// 【追加】認証エラー時のフォールバック用コンポーネント
const CustomAuthErrorComponent = ({ error }) => {
  const navigate = useNavigate();

  useEffect(() => {
    // エラー内容をコンソールに残しつつ、トップページへリダイレクトさせる
    console.warn('Okta Auth Error:', error);
    
    // すぐに遷移させても良いですが、1.5秒ほど待機するとユーザーに親切です
    const timer = setTimeout(() => {
      // replace: true でブラウザの履歴に残さないようにする
      navigate('/', { replace: true });
    }, 1500);

    return () => clearTimeout(timer);
  }, [navigate, error]);

  // エラー文字列の代わりに専用のローディング画面を表示
  return <LoadingScreen message="認証情報の取得に失敗しました。トップページへ戻ります..." />;
};

const App = () => {
  const navigate = useNavigate();
  const restoreOriginalUri = async (_oktaAuth, originalUri) => {
    navigate(toRelativeUrl(originalUri || '/', window.location.origin));
  };

  return (
    <Security oktaAuth={oktaAuth} restoreOriginalUri={restoreOriginalUri}>
      <Routes>
        {/* 【修正】errorComponent を指定して、エラー画面が露出するのを防ぐ */}
        <Route 
          path="/login/callback" 
          element={<LoginCallback errorComponent={CustomAuthErrorComponent} />} 
        />
        <Route path="/*" element={<AuthenticatedMainContent />} />
      </Routes>
    </Security>
  );
};

// 認証状態チェック用ラッパー
const AuthenticatedMainContent = () => {
  const { authState, oktaAuth } = useOktaAuth(); // useOktaAuthからoktaAuthも取得するように微修正

  if (!authState) {
    return <LoadingScreen message="認証状態を確認中..." />;
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF9F6] p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Smart Shift Scheduler</h1>
          <p className="text-sm text-slate-500 mb-6">関係者専用ログイン</p>
          <button 
            onClick={() => oktaAuth.signInWithRedirect()} 
            className="w-full py-2 px-4 bg-[#F4B896] text-white rounded-md shadow hover:bg-[#E8A680] font-semibold transition-colors"
          >
            Oktaでログイン
          </button>
        </div>
      </div>
    );
  }

  return <MainContent />;
};

export default App;
