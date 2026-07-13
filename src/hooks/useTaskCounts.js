// src/hooks/useTaskCounts.js
import { useState, useEffect } from 'react';

export const useTaskCounts = (initialDataLoaded, daysInMonth, tasks, staff, schedule, key) => {
  const [taskCountsByDay, setTaskCountsByDay] = useState({});

  useEffect(() => {
    if (!initialDataLoaded) return;
    const counts = {};
    for (let day = 1; day <= daysInMonth; day++) {
      counts[day] = {};
      tasks.forEach(t => counts[day][t.id] = 0);
      staff.forEach(s => {
        const entry = (schedule[key] || {})[s.id]?.[day];
        const isWorking = (typeof entry === 'number' && entry > 0) || (typeof entry === 'object' && entry?.hours > 0);
        if (isWorking) {
            s.possibleTasks.forEach(tId => { 
                if (counts[day][tId] !== undefined) counts[day][tId]++; 
            });
        }
      });
    }
    setTaskCountsByDay(counts);
  }, [schedule, key, staff, tasks, daysInMonth, initialDataLoaded]);

  return taskCountsByDay;
};
