const en = {
  title: 'Prepare a lesson around your materials',
  description:
    'Set the teaching goal, select sources, then work with the assistant on an outline, slides and exercises.',
  topic: 'Lesson topic',
  topicPlaceholder: 'For example: understanding linear functions',
  objectives: 'What should students learn?',
  objectivesPlaceholder:
    'Concepts, question types, and what students should be able to do independently',
  requirements: 'Your teaching requirements',
  requirementsPlaceholder:
    'Lesson length, class context, preferred activities, slide style, homework changes…',
  sources: 'Sources for this lesson',
  sourcesHint:
    'Attach only materials for this lesson. The assistant will identify readable passages before proposing the outline.',
  upload: 'Upload teaching materials',
  library: 'Choose from material library',
  noSources: 'Add a textbook excerpt, exam objectives or reference material.',
  role: 'Source role',
  chooseRole: 'Choose a role',
  roles: {
    textbook: 'Textbook excerpt',
    exam_objectives: 'Exam objectives',
    reference: 'Reference material',
  },
  location: 'Requested passage (optional)',
  locationPlaceholder: 'For example: pages 4–7, or the section headed…',
  locationHint: 'A requested location will be checked against the actual file.',
  remove: 'Remove',
  uploading: 'Uploading…',
  uploadFailed: 'Upload failed. Remove this item and retry.',
  libraryLoading: 'Loading materials…',
  libraryFailed: 'Could not load materials. Try opening the library again.',
  libraryEmpty: 'No more materials to select.',
  close: 'Close material library',
  outlineFirst: 'Outline first, slides after your review',
  workflow:
    'Review the sources and outline → generate the course → edit individual pages → export PPTX or PDF.',
  provenance:
    'Unknown textbook editions and regions remain unknown. AI examples and suggestions must be identified; unclear sources remain for your review.',
  privacy:
    'Only the selected files and this brief are sent to your configured model service. Student records are not added automatically.',
  start: 'Start lesson preparation',
  starting: 'Opening conversation…',
  continue: 'Open courses and conversations',
  topicRequired: 'Enter a lesson topic.',
  sourcesRequired: 'Select at least one material and choose a role for every source.',
  duplicateNames:
    'Two selected files have the same name. Select one, or re-upload with distinct names so source roles can be matched.',
  tooManySources: 'Select up to 20 materials per lesson.',
  createFailed:
    'Could not start the conversation. Your brief and selected materials are kept here.',
  unavailable:
    'The conversation workspace needs to be configured before lesson preparation can start.',
};

export type TeacherPreparationCopy = typeof en;

const zh: TeacherPreparationCopy = {
  title: '从你的教材出发，准备下一堂课',
  description: '明确教学目标、选定资料，与助手一起推敲大纲、课件和课后练习。',
  topic: '这堂课的主题',
  topicPlaceholder: '例如：一次函数的图像与性质',
  objectives: '希望学生学会什么',
  objectivesPlaceholder: '重点概念、考查题型，以及学生课后应能独立完成的任务',
  requirements: '你的教学要求',
  requirementsPlaceholder: '课时长度、课堂情况、互动方式、课件风格、作业调整要求……',
  sources: '本次备课资料',
  sourcesHint: '只选本次课要用的资料。助手先核对可读内容，再给出大纲和建议。',
  upload: '上传教学资料',
  library: '从资料库选择',
  noSources: '添加教材片段、考点要求或参考资料。',
  role: '资料用途',
  chooseRole: '选择资料用途',
  roles: { textbook: '教材片段', exam_objectives: '考点要求', reference: '参考资料' },
  location: '指定内容位置（选填）',
  locationPlaceholder: '例如：第 4–7 页，或“图像的平移”小节',
  locationHint: '指定位置会与实际文件核对，不作为已验证页码。',
  remove: '移除',
  uploading: '正在上传…',
  uploadFailed: '上传失败，请移除此项后重新上传。',
  libraryLoading: '正在读取资料库…',
  libraryFailed: '资料库读取失败，请重新打开重试。',
  libraryEmpty: '暂无其他可选资料。',
  close: '关闭资料库',
  outlineFirst: '先推敲大纲，确认后生成课件',
  workflow: '核对资料与大纲 → 生成课件 → 指定页面修改 → 导出 PPTX 或 PDF。',
  provenance:
    '未知教材版本与地区保持未知。AI 自编例题和教学建议单独标明，识别不清的内容留给你核对。',
  privacy: '只向已配置的模型服务提供本次所选资料与教学要求，不自动加入学生档案。',
  start: '开始备课',
  starting: '正在打开备课会话…',
  continue: '打开已有课件与会话',
  topicRequired: '请填写这堂课的主题。',
  sourcesRequired: '请至少选择一份资料，并为每份资料选择用途。',
  duplicateNames:
    '所选资料中有重名文件。请只选一份，或使用不同文件名重新上传，保证资料用途对应明确。',
  tooManySources: '每次备课最多选择 20 份资料。',
  createFailed: '暂时无法开始会话，教学要求和所选资料仍保留在此。',
  unavailable: '需要先配置智能体工作台，才能开始备课。',
};

export function getTeacherPreparationCopy(locale: string): TeacherPreparationCopy {
  return locale.startsWith('zh') ? zh : en;
}
