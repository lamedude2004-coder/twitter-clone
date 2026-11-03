import {
  useState,
  useEffect,
  useContext,
  createContext,
  useMemo,
  useRef
} from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut as signOutFirebase,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithPhoneNumber
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { auth } from '@lib/firebase/app';
import {
  usersCollection,
  userStatsCollection,
  userBookmarksCollection
} from '@lib/firebase/collections';
import { getRandomId, getRandomInt } from '@lib/random';
import { checkUsernameAvailability } from '@lib/firebase/utils';
import type { ReactNode } from 'react';
import type {
  AuthProvider,
  ConfirmationResult,
  RecaptchaVerifier
} from 'firebase/auth';
import type { User as AuthUser } from 'firebase/auth';
import type { WithFieldValue } from 'firebase/firestore';
import type { User } from '@lib/types/user';
import type { Bookmark } from '@lib/types/bookmark';
import type { Stats } from '@lib/types/stats';

type AuthContext = {
  user: User | null;
  error: Error | null;
  loading: boolean;
  signInPending: boolean;
  isAdmin: boolean;
  randomSeed: string;
  userBookmarks: Bookmark[] | null;
  signOut: () => Promise<void>;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string
  ) => Promise<void>;
  sendPhoneCode: (
    phoneNumber: string,
    verifier: RecaptchaVerifier
  ) => Promise<ConfirmationResult | null>;
  verifyPhoneCode: (
    confirmation: ConfirmationResult,
    code: string,
    name: string
  ) => Promise<void>;
};

export const AuthContext = createContext<AuthContext | null>(null);

type AuthContextProviderProps = {
  children: ReactNode;
};

export function AuthContextProvider({
  children
}: AuthContextProviderProps): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [userBookmarks, setUserBookmarks] = useState<Bookmark[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInPending, setSignInPending] = useState(false);
  const pendingProfileName = useRef<string | null>(null);

  useEffect(() => {
    const manageUser = async (authUser: AuthUser): Promise<void> => {
      try {
        const { uid, photoURL } = authUser;
        const displayName =
          authUser.displayName?.trim() ||
          pendingProfileName.current ||
          authUser.email?.split('@')[0] ||
          'user';
        const userSnapshot = await getDoc(doc(usersCollection, uid));

        if (!userSnapshot.exists()) {
          let available = false;
          let randomUsername = '';
          let usernameBase = displayName
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '');

          if (!usernameBase || !/[a-z]/.test(usernameBase)) {
            usernameBase = `user${usernameBase}`;
          }

          while (!available) {
            const suffix = String(getRandomInt(1, 10_000));
            randomUsername = `${usernameBase.slice(
              0,
              15 - suffix.length
            )}${suffix}`;

            const isUsernameAvailable = await checkUsernameAvailability(
              randomUsername
            );

            if (isUsernameAvailable) available = true;
          }

          const userData: WithFieldValue<User> = {
            id: uid,
            bio: null,
            name: displayName as string,
            theme: null,
            accent: null,
            website: null,
            location: null,
            photoURL: photoURL ?? '/assets/twitter-avatar.jpg',
            username: randomUsername,
            verified: false,
            following: [],
            followers: [],
            createdAt: serverTimestamp(),
            updatedAt: null,
            totalTweets: 0,
            totalPhotos: 0,
            pinnedTweet: null,
            coverPhotoURL: null
          };

          const userStatsData: WithFieldValue<Stats> = {
            likes: [],
            tweets: [],
            updatedAt: null
          };

          await Promise.all([
            setDoc(doc(usersCollection, uid), userData),
            setDoc(doc(userStatsCollection(uid), 'stats'), userStatsData)
          ]);

          const newUser = await getDoc(doc(usersCollection, uid));
          if (!newUser.exists()) {
            throw new Error(
              'Your account was created, but its profile did not load.'
            );
          }
          setUser(newUser.data() as User);
        } else {
          setUser(userSnapshot.data() as User);
        }
      } catch (error) {
        setError(error as Error);
      } finally {
        pendingProfileName.current = null;
        setLoading(false);
      }
    };

    const handleUserAuth = (authUser: AuthUser | null): void => {
      setLoading(true);

      if (authUser) void manageUser(authUser);
      else {
        setUser(null);
        setLoading(false);
      }
    };

    onAuthStateChanged(auth, handleUserAuth);
  }, []);

  useEffect(() => {
    if (!user) return;

    const { id } = user;

    const unsubscribeUser = onSnapshot(doc(usersCollection, id), (doc) => {
      setUser(doc.data() as User);
    });

    const unsubscribeBookmarks = onSnapshot(
      userBookmarksCollection(id),
      (snapshot) => {
        const bookmarks = snapshot.docs.map((doc) => doc.data());
        setUserBookmarks(bookmarks);
      }
    );

    return () => {
      unsubscribeUser();
      unsubscribeBookmarks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const signInWithProvider = async (provider: AuthProvider): Promise<void> => {
    setError(null);
    setSignInPending(true);

    try {
      const isMobileBrowser =
        typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobileBrowser) await signInWithRedirect(auth, provider);
      else await signInWithPopup(auth, provider);
    } catch (error) {
      setError(error as Error);
    } finally {
      setSignInPending(false);
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    await signInWithProvider(new GoogleAuthProvider());
  };

  const signInWithApple = async (): Promise<void> => {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    await signInWithProvider(provider);
  };

  const signInWithEmail = async (
    email: string,
    password: string
  ): Promise<void> => {
    setError(null);
    setSignInPending(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setError(error as Error);
    } finally {
      setSignInPending(false);
    }
  };

  const signUpWithEmail = async (
    name: string,
    email: string,
    password: string
  ): Promise<void> => {
    const profileName = name.trim();
    setError(null);
    setSignInPending(true);
    pendingProfileName.current = profileName;

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      await updateProfile(credential.user, { displayName: profileName });
    } catch (error) {
      if (!auth.currentUser) pendingProfileName.current = null;
      setError(error as Error);
    } finally {
      setSignInPending(false);
    }
  };

  const sendPhoneCode = async (
    phoneNumber: string,
    verifier: RecaptchaVerifier
  ): Promise<ConfirmationResult | null> => {
    setError(null);
    setSignInPending(true);

    try {
      return await signInWithPhoneNumber(auth, phoneNumber, verifier);
    } catch (error) {
      setError(error as Error);
      return null;
    } finally {
      setSignInPending(false);
    }
  };

  const verifyPhoneCode = async (
    confirmation: ConfirmationResult,
    code: string,
    name: string
  ): Promise<void> => {
    setError(null);
    setSignInPending(true);
    pendingProfileName.current = name.trim();

    try {
      await confirmation.confirm(code.trim());
    } catch (error) {
      pendingProfileName.current = null;
      setError(error as Error);
    } finally {
      setSignInPending(false);
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await signOutFirebase(auth);
    } catch (error) {
      setError(error as Error);
    }
  };

  const clearError = (): void => setError(null);

  const isAdmin = user ? user.username === 'ccrsxx' : false;
  const randomSeed = useMemo(getRandomId, [user?.id]);

  const value: AuthContext = {
    user,
    error,
    loading,
    signInPending,
    isAdmin,
    randomSeed,
    userBookmarks,
    signOut,
    clearError,
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    signUpWithEmail,
    sendPhoneCode,
    verifyPhoneCode
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContext {
  const context = useContext(AuthContext);

  if (!context)
    throw new Error('useAuth must be used within an AuthContextProvider');

  return context;
}
