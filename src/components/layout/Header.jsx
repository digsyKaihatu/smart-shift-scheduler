// src/components/layout/Header.jsx
import React from 'react';
import Legend from '../schedule/Legend';

const Header = ({ year, month, setYear, setMonth, saveStatus, setIsHelpOpen }) => {
  return (
    <header className="mb-4 bg-[#F4B896] text-white rounded-md shadow-lg p-3 flex justify-between items-center sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border-none rounded p-1 text-2xl font-bold text-black">
          {Array.from({length: 10}, (_, i) => 2020 + i).map(y => <option key={y} value={y} className="text-black">{y}</option>)}
        </select>
        <span className="text-xl">年</span>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent border-none rounded p-1 text-2xl font-bold text-black">
          {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m} className="text-black">{m}</option>)}
        </select>
        <span className="text-xl">月</span>
        <h1 className="text-2xl font-bold hidden sm:block">digsyシフト表</h1>
      </div>
      <div className="flex items-center gap-4">
          <span className="text-sm font-semibold w-32 text-center">{saveStatus === 'saved' ? '自動保存済み' : '保存中...'}</span>
          <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold shadow-sm transition-colors">更新</button>
          <button onClick={() => setIsHelpOpen(true)} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold shadow-sm transition-colors">ガイド</button>
          <Legend />
      </div>
    </header>
  );
};

export default Header;
