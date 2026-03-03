import React, { useState, useEffect, useRef } from 'react';

export const EditableCell = ({ 
    value, onUpdate, isAdmin, disabled, isToday, isHoliday, isWeekend, dayOfWeek, 
    rowIndex, colIndex, isSelected, onMouseDown, onMouseEnter, onFocus, onContextMenu, borderClass 
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef(null);

    // 値とロック状態の判定
    const displayValue = typeof value === 'object' && value !== null ? (value.hours !== undefined ? value.hours : value.type) : value;
    const isLocked = typeof value === 'object' && value !== null && value.locked;

    // ★修正ポイント: 「自分の行(disabledがfalse)」であり、かつ「ロックされていない（または管理者である）」なら編集可能
    const canEdit = !disabled && (!isLocked || isAdmin);

    const handleDoubleClick = () => {
        if (!canEdit) return; // 編集不可なら何もしない
        setIsEditing(true);
        setEditValue(displayValue || '');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            setIsEditing(false);
            if (editValue !== displayValue) onUpdate(editValue);
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    const handleBlur = () => {
        setIsEditing(false);
        if (editValue !== displayValue) onUpdate(editValue);
    };

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    // 背景色の決定
    let bgColor = 'bg-white';
    if (isSelected) bgColor = 'bg-blue-100';
    else if (isToday) bgColor = 'bg-yellow-50';
    else if (isHoliday) bgColor = 'bg-pink-50';
    else if (isWeekend) bgColor = 'bg-slate-50';
    
    if (isLocked) bgColor = 'bg-slate-200';
    if (!canEdit && !isLocked) bgColor = 'bg-gray-50'; // 編集不可のセルは視覚的に少しグレーアウト

    return (
        <div 
            className={`w-full h-full min-h-[40px] flex items-center justify-center ${canEdit ? 'cursor-cell hover:bg-slate-100' : 'cursor-not-allowed'} border-b border-r ${borderClass} ${bgColor} relative`}
            onDoubleClick={handleDoubleClick}
            onMouseDown={(e) => onMouseDown && onMouseDown(rowIndex, colIndex, e)}
            onMouseEnter={() => onMouseEnter && onMouseEnter(rowIndex, colIndex)}
            onContextMenu={(e) => onContextMenu && onContextMenu(rowIndex, colIndex, e)}
            tabIndex={0}
            onFocus={() => onFocus && onFocus(rowIndex, colIndex)}
        >
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    className="w-full h-full text-center outline-none bg-white font-bold text-sm"
                />
            ) : (
                <span className={`text-sm font-semibold select-none ${displayValue === '休' || displayValue === 'シフト休' ? 'text-red-500' : 'text-slate-700'}`}>
                    {displayValue === 'シフト休' ? '休' : displayValue}
                </span>
            )}
            {isLocked && (
                <span className="absolute top-0.5 right-0.5 text-[8px] text-slate-400" title="管理者がロックしています">🔒</span>
            )}
        </div>
    );
};

export const EditableStaffInfoCell = ({ value, onUpdate, disabled, className = '' }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef(null);

    const handleDoubleClick = () => {
        if (disabled) return;
        setIsEditing(true);
        setEditValue(value || '');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            setIsEditing(false);
            if (editValue !== value) onUpdate(editValue);
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    const handleBlur = () => {
        setIsEditing(false);
        if (editValue !== value) onUpdate(editValue);
    };

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    return (
        <div 
            className={`w-full h-full min-h-[40px] flex items-center justify-center px-1 ${disabled ? 'cursor-not-allowed' : 'cursor-text hover:bg-slate-50'} ${className}`}
            onDoubleClick={handleDoubleClick}
        >
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    className="w-full h-full text-center outline-none bg-white text-xs border border-blue-300 rounded"
                />
            ) : (
                <span className="text-xs font-semibold text-slate-700 truncate select-none">{value}</span>
            )}
        </div>
    );
};
