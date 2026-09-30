import { useContext, useEffect } from "react";
import { UNSAFE_NavigationContext as NavigationContext, Navigator, useLocation, useNavigate } from "react-router-dom";

// export function useShowConfirmDialog(when: boolean, callback: () => void) {
//   const navigator = useContext(NavigationContext).navigator;

//   useEffect(() => {
//     if (!when) return;

//     const pushState = navigator.push;

//     navigator.push = ((...args: Parameters<typeof pushState>) => {
//       callback(); // Show your custom alert dialog
//     }) as typeof pushState;

//     return () => {
//       navigator.push = pushState;
//     };
//   }, [when, callback, navigator]);
// }

// export function useShowConfirmDialog(when: boolean, onConfirm: () => void) {
//   const navigator = useContext(NavigationContext).navigator;

//   useEffect(() => {
//     if (!when) return;

//     const pushState = navigator.push;
//     navigator.push = ((...args: Parameters<typeof pushState>) => {
//       onConfirm(); // This should trigger your AlertDialog
//     }) as typeof pushState;

//     return () => {
//       navigator.push = pushState;
//     };
//   }, [when, onConfirm, navigator]);
// }


// export function useShowConfirmDialog(when: boolean, onConfirm: (retry: () => void) => void) {
//   const navigator = useContext(NavigationContext).navigator;

//   useEffect(() => {
//     if (!when) return;

//     const unblock = (navigator as Navigator).block((tx: any) => {
//       // tx.retry will retry the transition
//       onConfirm(() => {
//         unblock();
//         tx.retry();
//       });
//     });

//     return unblock;
//   }, [navigator, onConfirm, when]);
// }

export function useShowConfirmDialog(when: boolean, onConfirm: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const historyStack = [location.key];

  useEffect(() => {
    const unblock = window.history.pushState;

    window.onpopstate = (event) => {
      if (when) {
        event.preventDefault();
        onConfirm();
        window.history.pushState(null, "", window.location.pathname);
      }
    };

    return () => {
      window.onpopstate = null;
    };
  }, [when, onConfirm, navigate]);
}

