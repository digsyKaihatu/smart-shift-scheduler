import React from 'react';

const Legend = () => {
    const LegendItem = ({ colorClass, label }) => (
        <div className="flex items-center space-x-2">
            <div className={`w-4 h-4 rounded-sm ${colorClass}`}></div>
            <span className="font-medium text-white text-xs">{label}</span>
        </div>
    );

    return (
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
            <LegendItem colorClass="bg-green-200" label="稼働" />
            <LegendItem colorClass="bg-yellow-200" label="有休/半日有休/夏季休暇" />
            <LegendItem colorClass="bg-blue-200" label="通休/半日通休" />
            <LegendItem colorClass="bg-slate-300" label="シフト休/午前休" />
            <LegendItem colorClass="bg-red-200" label="欠勤" />
            <LegendItem colorClass="bg-orange-200" label="遅刻" />
            <LegendItem colorClass="bg-purple-200" label="早退" />
        </div>
    );
};

export default Legend;
