def hangman() :
    wordletters=['d', 'o', 'r']
    usedletters=[]
    correctletters=[]
    counter=0
    while counter<11 :
        letter = input('Input a letter :')
        if letter in (usedletters) :
            print('This letter has already been chosen. Choose another one.')
            break
        elif letter in (wordletters) :
            while (wordletters)!=(correctletters) :
                usedletters.append(letter)
                correctletters.append(letter)
                break
        else :
            usedletters.append(letter)
            counter+=1
            break

hangman()
