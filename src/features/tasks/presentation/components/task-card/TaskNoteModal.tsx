import React from "react";
import { Modal, ModalBody, ModalFooter } from "../../../../../shared/ui/Modal";
import { NoteEditor } from "../../../../../shared/ui/components/NoteEditor";
import { useTranslation } from "react-i18next";

interface TaskNoteModalProps {
  isOpen: boolean;
  note: string;
  onChange: (note: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export const TaskNoteModal: React.FC<TaskNoteModalProps> = ({
  isOpen,
  note,
  onChange,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("taskCard.note")}>
      <ModalBody>
        <NoteEditor value={note} onChange={onChange} />
      </ModalBody>
      <ModalFooter>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={onSave}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          {t("common.save")}
        </button>
      </ModalFooter>
    </Modal>
  );
};
