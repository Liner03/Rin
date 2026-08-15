import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "react-modal";
import { Button, ButtonWithLoading } from "./button";

Modal.setAppElement("#root");

export type Confirm = {
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
}

export type Alert = {
    message: string;
    onConfirm: () => void;
}

export type ShowAlertType = (msg: string, onConfirm?: () => (Promise<void> | void)) => void;

export function useAlert() {
    const [alert, setAlert] = useState<Alert | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const close = () => {
        alert?.onConfirm()
        setIsOpen(false)
        setAlert(null)
    }
    const showAlert = (alert: string, onConfirm?: () => void) => {
        setAlert({
            message: alert,
            onConfirm: onConfirm ?? (() => { })
        })
        setIsOpen(true)
    }
    const { t } = useTranslation()
    const AlertUI = () => (
        <Modal isOpen={isOpen}
            shouldCloseOnOverlayClick={true}
            shouldCloseOnEsc={true}
            onRequestClose={close}
            style={{
                content: {
                    top: '50%',
                    left: '50%',
                    right: 'auto',
                    bottom: 'auto',
                    marginRight: '-50%',
                    transform: 'translate(-50%, -50%)',
                    padding: '0',
                    border: 'none',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'transparent',
                    maxWidth: '40em'
                },
                overlay: {
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 1000
                }
            }}
        >
            <div className="flex w-full min-w-56 flex-col items-start gap-4 rounded-xl border border-black/5 bg-w p-5 sm:min-w-96 dark:border-white/10">
                <h1 className="text-lg font-semibold t-primary">
                    {t("alert")}
                </h1>
                <p className="text-sm leading-6 t-secondary">
                    {alert?.message}
                </p>
                <div className="mt-2 flex w-full flex-row items-center justify-end gap-2">
                    <Button onClick={close} title={t('confirm')} />
                </div>
            </div>
        </Modal>
    )
    return { showAlert, close, AlertUI }
}

export function useConfirm() {
    const [confirm, setConfirm] = useState<Confirm | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false);
    const close = () => {
        setConfirm(null)
        setIsOpen(false)
    }
    const showConfirm = (title: string, message: string, onConfirm?: () => Promise<void> | void) => {
        setConfirm({
            title,
            message,
            onConfirm: onConfirm ?? (() => { })
        })
        setIsOpen(true)
    }
    const { t } = useTranslation()
    const ConfirmUI = () => (
        <Modal isOpen={isOpen}
            shouldCloseOnOverlayClick={true}
            shouldCloseOnEsc={true}
            onRequestClose={close}
            style={{
                content: {
                    top: '50%',
                    left: '50%',
                    right: 'auto',
                    bottom: 'auto',
                    marginRight: '-50%',
                    transform: 'translate(-50%, -50%)',
                    padding: '0',
                    border: 'none',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'transparent',
                    maxWidth: '40em'
                },
                overlay: {
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 1000
                }
            }}
        >
            <div className="flex w-full min-w-56 flex-col items-start gap-4 rounded-xl border border-black/5 bg-w p-5 sm:min-w-96 dark:border-white/10">
                <h1 className="text-lg font-semibold t-primary">
                    {confirm?.title}
                </h1>
                <p className="text-sm leading-6 t-secondary">
                    {confirm?.message}
                </p>
                <div className="mt-2 flex w-full flex-row items-center justify-end gap-2">
                    <ButtonWithLoading
                        loading={loading}
                        onClick={async () => {
                            setLoading(true);
                            await confirm?.onConfirm();
                            setLoading(false);
                            setIsOpen(false);
                        }}
                        title={t('confirm')} />
                    <Button secondary onClick={close} title={t('cancel')} />
                </div>
            </div>
        </Modal>
    )
    return { showConfirm, close, ConfirmUI }
}