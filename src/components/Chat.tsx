import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import jsPDF from 'jspdf';
import { supabase } from '../pages/api/supabaseClient'; // Import supabase client

// Import the equipment questions data from equipmentQuestion.tsx
import equipmentQuestions from './equipmentQuestion';


interface Message {
    text: string;
    type: 'user' | 'ai';
}



const Chat: React.FC = () => {
    const [selectedEquipment, setSelectedEquipment] = useState<string>('');
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [isFirstVisit, setIsFirstVisit] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const [questionCounter, setQuestionCounter] = useState(0); // Counter for questions asked
    const maxQuestionsBeforeReset = 1; // Number of questions before reset (adjust as needed)

    const initialAIMessage: Message = {
        text: "👨‍🚒 Hey there! I'm equipHelper, your expert assistant for all things firefighting equipment! 🧰 Need help with maintaining your gear, or have questions about equipment care and inspection? Let’s make sure you're well-prepared for every emergency with properly maintained gear! 🚒💡",
        type: 'ai',
    };

    useEffect(() => {
        const savedMessages = localStorage.getItem('chatMessages');
        if (savedMessages) {
            setMessages(JSON.parse(savedMessages));
            setIsFirstVisit(false);
        } else {
            setMessages([initialAIMessage]);
        }
    }, []);

    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem('chatMessages', JSON.stringify(messages));
        }
    }, [messages]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

// 

const handleSubmitLogic = async (questionToSubmit: string) => {
    if (!questionToSubmit.trim()) return;

    setLoading(true);

    const userMessage: Message = { text: questionToSubmit, type: 'user' };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');

    // Increment the question counter before sending the question to the API
    setQuestionCounter((prevCounter) => prevCounter + 1);

    try {
        // Check if the question exists in the Supabase cache table
        const { data: cachedAnswer } = await supabase
            .from('qa_cache')
            .select('answer')
            .eq('question', questionToSubmit)
            .single();

        if (cachedAnswer) {
            const aiMessage: Message = { text: cachedAnswer.answer, type: 'ai' };
            setMessages((prev) => [...prev, aiMessage]);
        } else {
            // Fetch answer from API
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: questionToSubmit }),
            });

            const data = await res.json();
            const aiMessage: Message = { text: data.answer, type: 'ai' };
            setMessages((prev) => [...prev, aiMessage]);

            // Cache the question and answer in Supabase table if not cached
            const { error: insertError } = await supabase
                .from('qa_cache')
                .insert([{ question: questionToSubmit, answer: data.answer }]);

            if (insertError) {
                console.error('Error caching question and answer:', insertError);
            }
        }
    } catch (err) { // Changed 'error' to 'err' to avoid conflict with 'error' in try block
        console.error('Error:', err);
        const errorMessage: Message = { text: 'Sorry, something went wrong.', type: 'ai' };
        setMessages((prev) => [...prev, errorMessage]);
    } finally {
        setLoading(false);
    }
};



// 

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSubmitLogic(question);
    };

    const handlePredefinedQuestion = (predefinedQuestion: string) => {
        setQuestion(predefinedQuestion);
        handleSubmitLogic(predefinedQuestion);
    };

    const handleEquipmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedEquipment(e.target.value);
        setQuestion('');
        setQuestionCounter(0); // Reset question counter when new equipment is selected

    };

    const clearHistory = () => {
        const initialMessages = [initialAIMessage];
        setMessages(initialMessages);
        localStorage.removeItem('chatMessages');
        setIsFirstVisit(true);
    };

    const downloadPDF = () => {
        const doc = new jsPDF();
        const title = "equipHelper Chat History";
        doc.setFontSize(20);
        doc.text(title, 10, 10);

        let y = 20;
        messages.forEach((message) => {
            const sender = message.type === 'user' ? 'User' : 'equipHelper';
            doc.setFontSize(12);
            const text = `${sender}: ${message.text}`;
            const splitText = doc.splitTextToSize(text, 180);

            if (message.type === 'user') {
                doc.setTextColor(0, 102, 204);
            } else {
                doc.setTextColor(255, 165, 0);
            }

            splitText.forEach((line: string | string[]) => {
                doc.text(line, 10, y);
                y += 10;
            });

            if (y > 280) {
                doc.addPage();
                y = 10;
            }
        });

        doc.save('equipHelper_Chat_History.pdf');
    };
    
    const formatText = (text: string) => {
        // Remove any "URL" or "url" from the text before formatting
        const cleanedText = text.replace(/\b(URL|url)\b/g, '').trim();
    
        // Split text into parts by image paths and keep them as parts of the array
        const parts = cleanedText.split(/(\/ppe-images\/.*?\.png)/g);
    
        const formattedParts: (JSX.Element | string)[] = [];
    
        parts.forEach((part, index) => {
            if (/^\/ppe-images\/.*?\.png$/.test(part)) {
                // Handle image paths
                formattedParts.push(
                    <Image
                        key={index}
                        src={part}
                        alt="AI Response Image"
                        layout="responsive"
                        width={300}
                        height={200}
                        className="chat__image"
                    />
                );
            } else if (part.trim()) {
                // Format text by detecting lists, bold, and italic notations
                const processedText = part
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
                    .replace(/_(.*?)_/g, '<em>$1</em>'); // Italics
    
                const htmlParts = processedText.split('\n').map((line, lineIndex, arr) => {
                    // Check for list patterns
                    if (/^(-|\*|•)\s/.test(line)) {
                        // Wrap in <ul><li> tags for list formatting
                        return (
                            <ul key={`${index}-${lineIndex}`} className="chat__list">
                                <li dangerouslySetInnerHTML={{ __html: line.replace(/^(-|\*|•)\s/, '') }} />
                            </ul>
                        );
                    }
    
                    // Otherwise, render as regular text with line breaks, but avoid unnecessary <br /> tags
                    return (
                        <React.Fragment key={`${index}-${lineIndex}`}>
                            <span dangerouslySetInnerHTML={{ __html: line }} />
                            {lineIndex < arr.length - 1 && arr[lineIndex + 1].trim() && <br />} {/* Only add <br /> if the next line has content */}
                        </React.Fragment>
                    );
                });
    
                formattedParts.push(
                    <p key={index} className="chat__text">
                        {htmlParts}
                    </p>
                );
            }
        });
    
        return <>{formattedParts}</>;
    };
    
    
    
    const getQuestionsForSelectedEquipment = () => {
        if (selectedEquipment) {
            return equipmentQuestions[selectedEquipment as keyof typeof equipmentQuestions] || [];
        }
        return [];
    };

    useEffect(() => {
        if (questionCounter >= maxQuestionsBeforeReset) {
            setSelectedEquipment(''); // Reset to default after reaching max questions
            setQuestionCounter(0); // Reset counter after reaching max questions
        }
    }, [questionCounter]);

    return (
        <div className="chat">

            <div className="chat__actions chat__header">
                <button onClick={clearHistory} className="chat__button chat__button--clear">
                    Clear
                </button>

                <h1 className="chat__title">
                    equipHelper
                </h1>

                <button onClick={downloadPDF} className="chat__button chat__button--download">
                    PDF
                </button>
            </div>

            <div className="chat__messages">
                {messages.map((message, index) => (
                    <div key={index} className={`chat__message chat__message--${message.type}`}>
                        <div className={`chat__sender chat__sender--${message.type}`}>
                            {message.type === 'user' ? 'User' : 'equipHelper'}
                        </div>
                        <div className={`chat__bubble chat__bubble--${message.type}`}>
                            {message.type === 'ai' ? formatText(message.text) : <p>{message.text}</p>}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="chat__loading">
                        <Image src="/loadingGIF.gif" alt="Loading..." width={64} height={64} />
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
<div className="chat__messages-bottom-part">
            {isFirstVisit && (
                <div className="chat__welcome">
                    Welcome! Ask me about firefighting equipment or maintenance.
                </div>
            )}

            <div className="chat__dropdown">
                {/*<label htmlFor="equipment" className="chat__label">*/}
                {/*    Select Equipment:*/}
                {/*</label>*/}
                <select id="equipment" value={selectedEquipment} onChange={handleEquipmentChange} className="chat__select">
                    <option value="">Select Equipment</option>
                    {Object.keys(equipmentQuestions).map((equipment) => (
                        <option key={equipment} value={equipment}>
                            {equipment}
                        </option>
                    ))}
                </select>
            </div>

            {selectedEquipment && (
                <div className="chat__predefined-questions">
                    {getQuestionsForSelectedEquipment().map((question, index) => (
                        <button
                            key={index}
                            className="chat__button chat__button--predefined"
                            onClick={() => handlePredefinedQuestion(question)}
                        >
                            {question}
                        </button>
                    ))}
                </div>
            )}

            <form onSubmit={handleSubmit} className="chat__form">
                <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Type your question here..."
                    className="chat__input"
                />
                <button type="submit" className="chat__button chat__button--submit" disabled={loading}>
                    <svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="21" cy="21" r="21" fill="black"/>
                        <path d="M12 29V13L31 21L12 29ZM14 26L25.85 21L14 16V19.5L20 21L14 22.5V26Z" fill="white"/>
                    </svg>

                </button>
            </form>
</div>
        </div>
    );
};

export default Chat;