export type ContentBlockType = 
  | 'text' 
  | 'image' 
  | 'table' 
  | 'code' 
  | 'math' 
  | 'video' 
  | 'audio' 
  | 'pdf' 
  | 'interactive';

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  content: string; // Markdown/HTML text, image URL, code snippet, LaTeX string, or table raw data
  caption?: string;
  language?: string; // for code blocks (e.g. 'python', 'java', 'sql', 'cpp')
  altText?: string; // for images
  tableData?: string[][]; // 2D array representation for table block
  meta?: Record<string, any>; // future-ready extensibility
}

export interface MCQOptionData {
  id: 'A' | 'B' | 'C' | 'D' | string;
  text: string;
  imageUrl?: string;
  contentBlocks?: ContentBlock[];
}

export interface GenericQuestion {
  id: string;
  exam_id?: string;
  section_id?: string;
  question_type?: 'mcq' | 'coding' | 'descriptive' | string;
  title?: string; // for coding title or question summary
  question?: string; // for MCQ / Descriptive question text
  description?: string; // for coding / descriptive problem statement
  content_blocks?: ContentBlock[];
  images?: string[];
  difficulty?: 'easy' | 'medium' | 'hard' | string;
  marks?: number;
  word_limit?: number;
  evaluation_method?: 'manual' | 'ai' | string;
  
  // MCQ specific
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  option_a_image?: string;
  option_b_image?: string;
  option_c_image?: string;
  option_d_image?: string;
  correct_answer?: string;

  // Coding specific
  language?: string;
  starter_code?: string;
  time_limit?: number;
  memory_limit?: number;
  testCases?: Array<{ id?: string; input: string; expected_output: string; is_hidden?: boolean }>;
}
