import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAllow: () => void;
}

const PermissionModal = ({ isOpen, onClose, onAllow }: PermissionModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading font-bold text-xl text-primary">Appu needs your permission</DialogTitle>
          <DialogDescription className="text-neutral">
            To talk with you, Appu needs to use your microphone. Please allow access when prompted.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-center py-4">
          <div className="w-24 h-24">
            <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M388 160C388 160 408 140 428 140C448 140 468 160 468 180C468 200 448 220 428 220C408 220 388 200 388 180" fill="#9D78C9"/>
              <path d="M124 160C124 160 104 140 84 140C64 140 44 160 44 180C44 200 64 220 84 220C104 220 124 200 124 180" fill="#9D78C9"/>
              <ellipse cx="256" cy="280" rx="160" ry="140" fill="#9D78C9"/>
              <circle cx="216" cy="250" r="15" fill="white"/>
              <circle cx="217" cy="250" r="5" fill="black"/>
              <circle cx="296" cy="250" r="15" fill="white"/>
              <circle cx="297" cy="250" r="5" fill="black"/>
              <path d="M236 300C236 300 256 320 276 300" stroke="black" strokeWidth="4" strokeLinecap="round"/>
              <path d="M256 330C256 330 256 380 216 400" stroke="#9D78C9" strokeWidth="20" strokeLinecap="round"/>
              <path d="M243 370H269" stroke="black" strokeWidth="4" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
        
        <DialogFooter className="flex space-x-4 justify-center">
          <Button 
            variant="outline"
            className="border-primary text-primary font-heading font-bold rounded-full px-6"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            className="bg-primary hover:bg-purple-600 text-white font-heading font-bold rounded-full px-6"
            onClick={onAllow}
          >
            Allow Microphone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionModal;
export { PermissionModal };
