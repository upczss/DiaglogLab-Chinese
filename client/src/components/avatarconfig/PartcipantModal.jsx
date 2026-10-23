import React from 'react';

const ParticipantModal = ({ 
  participantCount, 
  setParticipantCount, 
  onCancel, 
  onSubmit, 
  isEditing = false 
}) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h2 className="text-xl font-semibold mb-4">
          {isEditing ? "修改对话群组" : "创建对话群组"}
        </h2>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            参与者数量
          </label>
          <input
            type="number"
            min="2"
            max="6"
            value={participantCount}
            onChange={(e) => setParticipantCount(Math.min(6, Math.max(2, parseInt(e.target.value))))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <p className="text-sm text-gray-500 mt-1">最少 2 人，最多 6 人</p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            {isEditing ? "更新" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParticipantModal;