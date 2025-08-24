import React, { createContext, useContext, useEffect, useState } from "react";

const CurrentTimeContext = createContext<Date>(new Date());

export const CurrentTimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <CurrentTimeContext.Provider value={now}>{children}</CurrentTimeContext.Provider>
  );
};

export const useCurrentTime = () => useContext(CurrentTimeContext);
