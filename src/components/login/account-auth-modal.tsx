import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { RecaptchaVerifier } from 'firebase/auth';
import { useAuth } from '@lib/context/auth-context';
import { auth } from '@lib/firebase/app';
import { Button } from '@components/ui/button';
import { Modal } from '@components/modal/modal';
import type { ConfirmationResult } from 'firebase/auth';
import type { FormEvent } from 'react';

export type AuthMode = 'sign-in' | 'sign-up';
type AuthMethod = 'email' | 'phone';

type AccountAuthModalProps = {
  open: boolean;
  mode: AuthMode;
  closeModal: () => void;
  changeMode: (mode: AuthMode) => void;
};

const inputClassName =
  'w-full rounded-lg border border-light-line-reply bg-transparent px-3 py-3 outline-none transition focus:border-accent-blue focus:ring-1 focus:ring-accent-blue dark:border-dark-border';

function getAuthErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  const code = (error as Error & { code?: string }).code;

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'This sign-in method is disabled for the Firebase project. Enable it in Firebase Authentication settings.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Choose a stronger password with at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return 'Enter a phone number in international format, such as +15555550123.';
    case 'auth/invalid-verification-code':
      return 'That verification code is incorrect. Check the SMS and try again.';
    case 'auth/code-expired':
      return 'That verification code expired. Request a new one.';
    case 'auth/quota-exceeded':
      return 'SMS verification is temporarily unavailable for this project.';
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA verification failed. Please try again.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'The email or password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a bit before trying again.';
    default:
      return error.message;
  }
}

export function AccountAuthModal({
  open,
  mode,
  closeModal,
  changeMode
}: AccountAuthModalProps): JSX.Element {
  const {
    error,
    loading,
    signInPending,
    clearError,
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    signUpWithEmail,
    sendPhoneCode,
    verifyPhoneCode
  } = useAuth();
  const [method, setMethod] = useState<AuthMethod>('email');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneName, setPhoneName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmation, setConfirmation] =
    useState<ConfirmationResult | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const busy = loading || signInPending;
  const isSigningUp = mode === 'sign-up';
  const errorMessage = phoneError ?? getAuthErrorMessage(error);

  useEffect(() => {
    if (!open) {
      setMethod('email');
      setConfirmation(null);
      setVerificationCode('');
      setPhoneNumber('');
      setPhoneName('');
      setPhoneError(null);
      return;
    }

    return () => {
      verifier.current?.clear();
      verifier.current = null;
    };
  }, [open]);

  const clearVerifier = (): void => {
    verifier.current?.clear();
    verifier.current = null;
  };

  const selectMethod = (nextMethod: AuthMethod): void => {
    clearError();
    setPhoneError(null);
    setConfirmation(null);
    setVerificationCode('');
    clearVerifier();
    setMethod(nextMethod);
  };

  const handleEmailSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') ?? '');
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    if (isSigningUp) await signUpWithEmail(name, email, password);
    else await signInWithEmail(email, password);
  };

  const handleSendPhoneCode = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    clearError();
    setPhoneError(null);

    const normalizedNumber = phoneNumber.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedNumber)) {
      setPhoneError(
        'Enter a phone number in international format, such as +15555550123.'
      );
      return;
    }

    try {
      const applicationVerifier =
        verifier.current ??
        new RecaptchaVerifier(
          'phone-recaptcha-container',
          { size: 'invisible' },
          auth
        );
      verifier.current = applicationVerifier;

      const result = await sendPhoneCode(normalizedNumber, applicationVerifier);
      if (result) {
        setPhoneNumber(normalizedNumber);
        setConfirmation(result);
      }
    } catch (error) {
      setPhoneError((error as Error).message);
    }
  };

  const handleVerifyPhoneCode = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (!confirmation) return;

    await verifyPhoneCode(confirmation, verificationCode, phoneName);
  };

  const changeAuthMode = (nextMode: AuthMode): void => {
    clearError();
    setPhoneError(null);
    setConfirmation(null);
    setVerificationCode('');
    clearVerifier();
    changeMode(nextMode);
  };

  return (
    <Modal
      open={open}
      closeModal={closeModal}
      modalClassName='w-full max-w-md rounded-2xl bg-main-background p-6 shadow-xl'
    >
      <div className='flex flex-col gap-6'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex flex-col gap-1'>
            <Dialog.Title className='text-2xl font-bold'>
              {isSigningUp ? 'Create your account' : 'Sign in'}
            </Dialog.Title>
            <Dialog.Description className='text-light-secondary dark:text-dark-secondary'>
              {isSigningUp
                ? 'Continue with a provider, email, or phone number.'
                : 'Choose how you want to sign in.'}
            </Dialog.Description>
          </div>
          <Button
            className='shrink-0 px-3 py-1 text-light-secondary hover:bg-light-primary/10 dark:text-dark-secondary'
            onClick={closeModal}
            aria-label='Close sign-in form'
          >
            Close
          </Button>
        </div>

        {!isSigningUp && (
          <div className='grid grid-cols-2 gap-2'>
            <Button
              className='border border-light-line-reply font-bold text-accent-blue hover:bg-accent-blue/10 dark:border-light-secondary'
              loading={busy}
              onClick={signInWithGoogle}
            >
              Sign in with Google
            </Button>
            <Button
              className='border border-light-line-reply font-bold text-accent-blue hover:bg-accent-blue/10 dark:border-light-secondary'
              loading={busy}
              onClick={signInWithApple}
            >
              Sign in with Apple
            </Button>
          </div>
        )}

        <div className='grid grid-cols-2 gap-2 rounded-xl bg-light-border/40 p-1 dark:bg-dark-border/50'>
          <Button
            className={
              method === 'email'
                ? 'bg-accent-blue font-bold text-white'
                : 'font-bold text-light-secondary dark:text-dark-secondary'
            }
            onClick={() => selectMethod('email')}
          >
            Email
          </Button>
          <Button
            className={
              method === 'phone'
                ? 'bg-accent-blue font-bold text-white'
                : 'font-bold text-light-secondary dark:text-dark-secondary'
            }
            onClick={() => selectMethod('phone')}
          >
            Phone
          </Button>
        </div>

        {method === 'email' ? (
          <form className='flex flex-col gap-4' onSubmit={handleEmailSubmit}>
            {isSigningUp && (
              <label className='flex flex-col gap-1 text-sm font-medium'>
                Display name
                <input
                  className={inputClassName}
                  type='text'
                  name='name'
                  autoComplete='name'
                  maxLength={60}
                  required
                />
              </label>
            )}
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Email
              <input
                className={inputClassName}
                type='email'
                name='email'
                autoComplete='email'
                required
              />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Password
              <input
                className={inputClassName}
                type='password'
                name='password'
                autoComplete={isSigningUp ? 'new-password' : 'current-password'}
                minLength={6}
                required
              />
            </label>
            {errorMessage && (
              <p className='text-sm text-red-600' role='alert'>
                {errorMessage}
              </p>
            )}
            <Button
              className='bg-accent-blue font-bold text-white transition hover:brightness-90 active:brightness-75'
              type='submit'
              loading={busy}
            >
              {isSigningUp ? 'Create account' : 'Sign in'}
            </Button>
          </form>
        ) : (
          <div className='flex flex-col gap-4'>
            {confirmation ? (
              <form
                className='flex flex-col gap-4'
                onSubmit={handleVerifyPhoneCode}
              >
                {isSigningUp && (
                  <label className='flex flex-col gap-1 text-sm font-medium'>
                    Display name
                    <input
                      className={inputClassName}
                      type='text'
                      autoComplete='name'
                      maxLength={60}
                      value={phoneName}
                      onChange={(event) => setPhoneName(event.target.value)}
                      required
                    />
                  </label>
                )}
                <p className='text-sm text-light-secondary dark:text-dark-secondary'>
                  Enter the verification code sent to {phoneNumber}.
                </p>
                <label className='flex flex-col gap-1 text-sm font-medium'>
                  Verification code
                  <input
                    className={inputClassName}
                    type='text'
                    inputMode='numeric'
                    autoComplete='one-time-code'
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    minLength={4}
                    required
                  />
                </label>
                {errorMessage && (
                  <p className='text-sm text-red-600' role='alert'>
                    {errorMessage}
                  </p>
                )}
                <Button
                  className='bg-accent-blue font-bold text-white transition hover:brightness-90 active:brightness-75'
                  type='submit'
                  loading={busy}
                >
                  Verify code and continue
                </Button>
                <Button
                  className='font-bold text-accent-blue'
                  onClick={() => {
                    setConfirmation(null);
                    setVerificationCode('');
                    clearError();
                  }}
                >
                  Use a different phone number
                </Button>
              </form>
            ) : (
              <form
                className='flex flex-col gap-4'
                onSubmit={handleSendPhoneCode}
              >
                {isSigningUp && (
                  <label className='flex flex-col gap-1 text-sm font-medium'>
                    Display name
                    <input
                      className={inputClassName}
                      type='text'
                      autoComplete='name'
                      maxLength={60}
                      value={phoneName}
                      onChange={(event) => setPhoneName(event.target.value)}
                      required
                    />
                  </label>
                )}
                <label className='flex flex-col gap-1 text-sm font-medium'>
                  Phone number
                  <input
                    className={inputClassName}
                    type='tel'
                    autoComplete='tel'
                    placeholder='+15555550123'
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    required
                  />
                </label>
                <p className='text-xs text-light-secondary dark:text-dark-secondary'>
                  Include your country code. Firebase will text you a
                  verification code.
                </p>
                {errorMessage && (
                  <p className='text-sm text-red-600' role='alert'>
                    {errorMessage}
                  </p>
                )}
                <div id='phone-recaptcha-container' />
                <Button
                  className='bg-accent-blue font-bold text-white transition hover:brightness-90 active:brightness-75'
                  type='submit'
                  loading={busy}
                >
                  Send verification code
                </Button>
              </form>
            )}
          </div>
        )}

        <p className='text-center text-sm'>
          {isSigningUp ? 'Already have an account?' : 'New to Twitter Clone?'}{' '}
          <button
            className='custom-underline font-bold text-accent-blue'
            type='button'
            onClick={() => changeAuthMode(isSigningUp ? 'sign-in' : 'sign-up')}
          >
            {isSigningUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </Modal>
  );
}
