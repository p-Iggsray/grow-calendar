import { useEffect, useState } from "react";

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    function up()   { setOnline(true);  }
    function down() { setOnline(false); }
    window.addEventListener("online",  up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online",  up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
